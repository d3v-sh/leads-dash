# LeadFlow — Customer Enquiry & Lead Management Dashboard

A full-stack CRM dashboard built with **React (Vite)**, **Tailwind CSS v4**, **Go (`net/http`)**, and **MongoDB** for tracking customer enquiries, scheduling follow-ups, and visualizing lead pipeline metrics.

---

## Features

- **Authentication & Data Isolation:** User registration and login secured with `bcrypt` password hashing and HMAC-SHA256 JWT tokens; each account accesses only its own leads.
- **Dashboard Overview:** Live summary cards displaying **Total Leads**, **New Enquiries**, and **Converted Customers** with percentage breakdowns.
- **Lead Pipeline Management (CRUD):**
  - Create, edit, and delete leads with **Name**, **Email**, **Phone Number**, **Business Name**, **Status** (`New`, `Contacted`, `Converted`), **Scheduled Contact Time**, and optional **Customer Specific Requirements**.
  - Inline status dropdowns for one-click pipeline stage updates.
- **Real-Time Search & Filtering:** Filter leads by status (`All`, `New`, `Contacted`, `Converted`) and search by lead name or email address.
- **Graph & Analytics View:** Toggle between the pipeline workspace and visual stage distribution bars and conversion overview rings.
- **Responsive UX:** Adaptive desktop data table and mobile card layouts with loading states, empty-state prompts, error banners, and client/server validation.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, Vite, Tailwind CSS v4 |
| **Backend** | Go (`net/http`), `golang.org/x/crypto/bcrypt`, HMAC-SHA256 JWT |
| **Database** | MongoDB (`go.mongodb.org/mongo-driver/v2`) |
| **Deployment** | Vercel (Frontend), Render (Go API), MongoDB Atlas (Database) |

---

## Project Structure

```text
lead-dashboard/
├── backend/
│   ├── go.mod
│   └── main.go          # REST API, JWT auth middleware, MongoDB CRUD handlers
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx      # Auth gate, dashboard, graph view, lead modals
        ├── index.css    # Tailwind CSS v4 import
        └── main.jsx