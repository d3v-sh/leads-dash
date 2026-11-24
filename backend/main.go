package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	Name      string        `bson:"name" json:"name"`
	Email     string        `bson:"email" json:"email"`
	Password  string        `bson:"password" json:"-"`
	CreatedAt time.Time     `bson:"createdAt" json:"createdAt"`
}

type AuthRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type Lead struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID       bson.ObjectID `bson:"userId" json:"userId"`
	Name         string        `bson:"name" json:"name"`
	Email        string        `bson:"email" json:"email"`
	Phone        string        `bson:"phone" json:"phone"`
	BusinessName string        `bson:"businessName" json:"businessName"`
	Status       string        `bson:"status" json:"status"` // "New", "Contacted", "Converted"
	ContactWhen  string        `bson:"contactWhen" json:"contactWhen"`
	Requirements string        `bson:"requirements,omitempty" json:"requirements"`
	CreatedAt    time.Time     `bson:"createdAt" json:"createdAt"`
}

type contextKey string

const userIDKey contextKey = "userID"

var (
	leadsCollection *mongo.Collection
	usersCollection *mongo.Collection
	jwtSecret       []byte
	emailRegex      = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
)

func main() {
	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017"
	}

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "super-secret-leadflow-key-change-in-prod"
	}
	jwtSecret = []byte(secret)

	client, err := mongo.Connect(options.Client().ApplyURI(mongoURI))
	if err != nil {
		log.Fatal("Mongo connection error:", err)
	}
	defer func() {
		if err = client.Disconnect(context.Background()); err != nil {
			log.Println("Error disconnecting Mongo:", err)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx, nil); err != nil {
		log.Fatal("Could not ping MongoDB. Error:", err)
	}
	log.Println("Connected to MongoDB!")

	db := client.Database("crm_db")
	leadsCollection = db.Collection("leads")
	usersCollection = db.Collection("users")

	// Ensure unique email index on users
	_, _ = usersCollection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true),
	})

	mux := http.NewServeMux()

	// Public Auth Routes
	mux.HandleFunc("POST /api/signup", signupHandler)
	mux.HandleFunc("POST /api/login", loginHandler)

	// Protected Lead Routes
	mux.Handle("GET /api/leads", authMiddleware(http.HandlerFunc(getLeads)))
	mux.Handle("POST /api/leads", authMiddleware(http.HandlerFunc(createLead)))
	mux.Handle("PUT /api/leads/{id}", authMiddleware(http.HandlerFunc(updateLead)))
	mux.Handle("DELETE /api/leads/{id}", authMiddleware(http.HandlerFunc(deleteLead)))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Println("Backend server running on port", port)
	log.Fatal(http.ListenAndServe(":"+port, corsMiddleware(mux)))
}

// --- JWT Helpers (Standard Library HMAC-SHA256) ---

func generateToken(userID string) (string, error) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	claimsMap := map[string]any{
		"sub": userID,
		"exp": time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	claimsBytes, err := json.Marshal(claimsMap)
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(claimsBytes)
	unsigned := header + "." + payload

	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(unsigned))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return unsigned + "." + sig, nil
}

func verifyToken(tokenStr string) (string, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return "", errors.New("invalid token format")
	}
	unsigned := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(unsigned))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(parts[2]), []byte(expectedSig)) {
		return "", errors.New("invalid token signature")
	}

	claimsBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", errors.New("invalid token payload")
	}
	var claims struct {
		Sub string `json:"sub"`
		Exp int64  `json:"exp"`
	}
	if err := json.Unmarshal(claimsBytes, &claims); err != nil {
		return "", errors.New("invalid token claims")
	}
	if time.Now().Unix() > claims.Exp {
		return "", errors.New("token expired")
	}
	return claims.Sub, nil
}

// --- Middlewares ---

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: missing token"})
			return
		}
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		userIDHex, err := verifyToken(tokenStr)
		if err != nil {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: " + err.Error()})
			return
		}
		objID, err := bson.ObjectIDFromHex(userIDHex)
		if err != nil {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid user ID in token"})
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, objID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func respondJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

// --- Auth Handlers ---

func signupHandler(w http.ResponseWriter, r *http.Request) {
	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON payload"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	if req.Name == "" || req.Email == "" || req.Password == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Name, email, and password are required."})
		return
	}
	if !emailRegex.MatchString(req.Email) {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Please enter a valid email address."})
		return
	}
	if len(req.Password) < 6 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Password must be at least 6 characters."})
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to secure password"})
		return
	}

	user := User{
		ID:        bson.NewObjectID(),
		Name:      req.Name,
		Email:     req.Email,
		Password:  string(hashed),
		CreatedAt: time.Now(),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := usersCollection.InsertOne(ctx, user); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": "An account with this email already exists."})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Could not create account"})
		return
	}

	token, err := generateToken(user.ID.Hex())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to generate token"})
		return
	}

	respondJSON(w, http.StatusCreated, map[string]any{
		"token": token,
		"user":  user,
	})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON payload"})
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Email and password are required."})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user User
	err := usersCollection.FindOne(ctx, bson.M{"email": req.Email}).Decode(&user)
	if err != nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid email or password."})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid email or password."})
		return
	}

	token, err := generateToken(user.ID.Hex())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to generate token"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user":  user,
	})
}

// --- Lead Handlers ---

func validateLead(lead *Lead) string {
	lead.Name = strings.TrimSpace(lead.Name)
	lead.Email = strings.TrimSpace(strings.ToLower(lead.Email))
	lead.Phone = strings.TrimSpace(lead.Phone)
	lead.BusinessName = strings.TrimSpace(lead.BusinessName)
	lead.ContactWhen = strings.TrimSpace(lead.ContactWhen)
	lead.Requirements = strings.TrimSpace(lead.Requirements)

	if lead.Name == "" || lead.Email == "" || lead.Phone == "" || lead.BusinessName == "" {
		return "Name, email, phone, and business name are required."
	}
	if !emailRegex.MatchString(lead.Email) {
		return "Please provide a valid email address."
	}
	if lead.ContactWhen == "" {
		return "Please specify when the lead should be contacted."
	}
	if lead.Status == "" {
		lead.Status = "New"
	}
	if lead.Status != "New" && lead.Status != "Contacted" && lead.Status != "Converted" {
		return "Status must be New, Contacted, or Converted."
	}
	return ""
}

func getLeads(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(bson.ObjectID)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}})
	cursor, err := leadsCollection.Find(ctx, bson.M{"userId": userID}, opts)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch leads"})
		return
	}
	defer cursor.Close(ctx)

	leads := []Lead{}
	if err := cursor.All(ctx, &leads); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to parse leads"})
		return
	}

	respondJSON(w, http.StatusOK, leads)
}

func createLead(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(bson.ObjectID)

	var lead Lead
	if err := json.NewDecoder(r.Body).Decode(&lead); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON payload"})
		return
	}

	if errMsg := validateLead(&lead); errMsg != "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	lead.ID = bson.NewObjectID()
	lead.UserID = userID
	lead.CreatedAt = time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := leadsCollection.InsertOne(ctx, lead); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save lead"})
		return
	}

	respondJSON(w, http.StatusCreated, lead)
}

func updateLead(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(bson.ObjectID)
	idParam := r.PathValue("id")
	objID, err := bson.ObjectIDFromHex(idParam)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid lead ID"})
		return
	}

	var lead Lead
	if err := json.NewDecoder(r.Body).Decode(&lead); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON payload"})
		return
	}

	if errMsg := validateLead(&lead); errMsg != "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	update := bson.M{
		"$set": bson.M{
			"name":         lead.Name,
			"email":        lead.Email,
			"phone":        lead.Phone,
			"businessName": lead.BusinessName,
			"status":       lead.Status,
			"contactWhen":  lead.ContactWhen,
			"requirements": lead.Requirements,
		},
	}

	res, err := leadsCollection.UpdateOne(ctx, bson.M{"_id": objID, "userId": userID}, update)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update lead"})
		return
	}
	if res.MatchedCount == 0 {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "Lead not found"})
		return
	}

	lead.ID = objID
	lead.UserID = userID
	respondJSON(w, http.StatusOK, lead)
}

func deleteLead(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(userIDKey).(bson.ObjectID)
	idParam := r.PathValue("id")
	objID, err := bson.ObjectIDFromHex(idParam)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid lead ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := leadsCollection.DeleteOne(ctx, bson.M{"_id": objID, "userId": userID})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete lead"})
		return
	}
	if res.DeletedCount == 0 {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "Lead not found"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "Lead deleted"})
}
