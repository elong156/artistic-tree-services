# Artistic Tree Services – Website Setup Guide

## Files
- `index.html` – Main website (frontend)
- `admin.html` – Admin dashboard
- `server.js`  – Node.js backend
- `package.json` – Dependencies

---

## Quick Start (Local)

**Requirements:** Node.js 18+ installed ([nodejs.org](https://nodejs.org))

```bash
# 1. Install dependencies
npm install

# 2. Start the server
node server.js

# 3. Open your browser
# Website:  http://localhost:3000
# Admin:    http://localhost:3000/admin.html
```

**Default admin credentials:**
- Username: `admin`
- Password: `treesrule2024`

⚠️ Change the password immediately after first login via Settings → Change Password.

---

## Email Notifications (Optional)

To receive email alerts for every new form submission, create a `.env` file:

```
BUSINESS_EMAIL=youremail@gmail.com
EMAIL_USER=youremail@gmail.com
EMAIL_PASS=your-gmail-app-password
SESSION_SECRET=some-random-long-string-here
```

For Gmail, use an **App Password** (not your regular password):
Google Account → Security → 2-Step Verification → App passwords

---

## Deploying to the Internet

### Option A – Railway (Easiest, Free tier available)
1. Push files to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Set environment variables in Railway dashboard
4. Done! Railway gives you a public URL.

### Option B – Render
1. Push to GitHub
2. [render.com](https://render.com) → New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `node server.js`

### Option C – VPS (DigitalOcean, Linode)
```bash
# Install Node.js, then:
npm install
npm install -g pm2
pm2 start server.js --name artistic-tree
pm2 startup   # Auto-start on reboot
```
Use Nginx as a reverse proxy on port 80/443 with SSL from Let's Encrypt.

---

## Admin Dashboard Features
- View all leads, quote requests, and bookings
- Filter by type and status
- Update lead status: New → Contacted → Scheduled → Completed
- Delete entries
- Search by name, phone, email, or address
- Dashboard stats (total, new, today)

---

## Customizing the Website
- Phone number: Search for `6263830505` in `index.html` and replace
- Business hours: Find the `hours-card` section in `index.html`
- Colors: Edit the `:root` CSS variables at the top of `index.html`
- Services: Edit the `.services-grid` section in `index.html`
- Testimonials: Edit the `.reviews-grid` section

---

## Support
If you need help with hosting or customizations, contact your web developer.
