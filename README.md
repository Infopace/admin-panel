# Aegis Assessment Portal (Unified 5-Database Dashboard)

A premium, modern dashboard designed to aggregate and display test taker information, test responses, and generate PDF report exports from **5 separate Supabase (PostgreSQL) databases**.

## Project Architecture

```
├── backend/
│   ├── adapters/
│   │   ├── db1.js (Cognitive Aptitude Test Adapter)
│   │   ├── db2.js (Coding Skills Assessment Adapter)
│   │   ├── db3.js (Personality Profile Adapter)
│   │   ├── db4.js (English Proficiency Test Adapter)
│   │   └── db5.js (Technical Architecture Quiz Adapter)
│   ├── server.js (Express API server & PDF generator)
│   ├── .env (Configuration variables for database credentials)
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx (Main React App UI)
│   │   ├── index.css (Premium Dark Slate & Neon CSS styling)
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
│
└── package.json (Root workspace config)
```

### Key Design Patterns Used
1. **Database Adapter Pattern**: Since every assessment tool uses different schemas, the backend queries each project via its own file under `backend/adapters/`. These adapters query individual tables and format the output into a unified structure.
2. **Dynamic Client Pooling**: Supabase clients are instantiated on demand. If a project's credentials are not configured in `.env`, the adapter falls back to realistic high-fidelity mock data automatically.
3. **Dynamic Connection Settings Panel**: You can paste in live URL and Key configuration details directly inside the dashboard UI to connect databases in real-time.
4. **Backend PDF Generation**: Clean PDFs are generated on the server using `pdfkit` and streamed directly to your browser for download.

---

## Getting Started

### 1. Prerequisite
Ensure you have [Node.js](https://nodejs.org/) installed (v16+ recommended).

### 2. Start the Development Servers
From the root project directory:
```bash
# Run both the Backend and Frontend concurrently
npm run dev
```

- **Frontend Application**: Running at [http://localhost:5173](http://localhost:5173)
- **Backend API Server**: Running at [http://localhost:5000](http://localhost:5000)

---

## Connecting Your Live Supabase Databases

### Option A: Via Environment Variables (Recommended)
Rename `backend/.env.example` to `backend/.env` and paste in your Supabase project URLs and Key strings:
```env
SUPABASE_URL_1=https://xxxxxx.supabase.co
SUPABASE_KEY_1=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
# Repeat for URL_2 to URL_5
```

### Option B: Via the Settings Panel
Open the dashboard browser tab, navigate to **Supabase Settings** in the sidebar, paste the credentials for any database, and click **Connect Database**.

---

## Customizing Database Table & Column Queries

Since your Supabase databases already store data, you can match our queries to your schemas. 

1. Open the database adapter for the specific tool (e.g. [db1.js](file:///c:/Users/Dell/OneDrive%20-%20Infopace%20Management%20Pvt.%20Ltd/Desktop/Dashboard/backend/adapters/db1.js)).
2. Edit the constant fields at the top to match your tables and columns:
   ```javascript
   const TABLES = {
     CANDIDATES: 'your_user_table',
     ANSWERS: 'your_answers_table'
   };
   
   const COLS = {
     CANDIDATE_ID: 'user_id_column',
     CANDIDATE_NAME: 'full_name',
     // ...
   };
   ```
3. Update the query inside `getCandidates` and `getCandidateDetails` to fit your table relationships (e.g., joins, column structures). The backend will automatically output standard JSON formats which the frontend will render beautifully.
