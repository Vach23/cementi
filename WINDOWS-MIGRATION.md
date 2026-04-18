# Migrating Cementi to Windows Server

Guide for migrating from the current Linux VPS (Ubuntu + nginx + PM2) to Windows Server with IIS.

## Quick start (just get it running)

If you only need to run the site locally for development or testing, you don't need IIS or Windows Services — just Node.js:

```powershell
# 1. Install Node.js 20 LTS from https://nodejs.org/
# 2. Clone the repo and install dependencies
git clone <REPO_URL> cementi
cd cementi
npm install

# 3. Unzip the data archive into the project root
Expand-Archive -Path cementi-server-data.zip -DestinationPath .

# 4. Run
node server.js
# → Open http://localhost:3000
```

Default admin login: `admin` / `admin`. Change the password via the admin panel at `/admin` (Uživatelé section).

The rest of this guide covers a full production deployment with IIS, HTTPS, and auto-start.

---

## Prerequisites

- Windows Server 2019 or later (or Windows 10/11 for development)
- IIS installed and enabled (Web Server role) — only needed for production
- Administrator access
- Git installed (`winget install Git.Git`)

## 1. Install Node.js

Download and install Node.js 20 LTS from https://nodejs.org/. The installer adds `node` and `npm` to PATH and includes the necessary native build tools.

Verify in PowerShell:
```powershell
node --version   # v20.x.x
npm --version    # 10.x.x
```

## 2. Clone the repository

```powershell
cd C:\inetpub
git clone <REPO_URL> cementi
cd cementi
npm install --production
```

> **Note:** `better-sqlite3` and `sharp` are native addons. If `npm install` fails with build errors, install Visual Studio Build Tools:
> ```powershell
> npm install --global windows-build-tools
> ```
> Or download Build Tools from https://visualstudio.microsoft.com/visual-cpp-build-tools/ and select "Desktop development with C++".

## 3. Transfer data from the Linux server

The git repository does **not** contain photos, thumbnails, or the database — these are shipped separately in a zip file.

### Option A: Use the provided zip (easiest)

A pre-built `cementi-server-data.zip` (~1 GB) is available alongside the repository. It contains everything the server needs that isn't in git:

```
cementi-server-data.zip
├── data/cementi.db              ← SQLite database (users, comments, albums, articles)
├── public/foto/                 ← original photos (~858 MB)
├── public/thumbs/               ← WebP thumbnails (~25 MB)
├── public/display/              ← display-size copies for lightbox (~123 MB)
└── public/obrazky/articles/     ← uploaded article icons
```

Extract it into the project root:
```powershell
Expand-Archive -Path cementi-server-data.zip -DestinationPath C:\inetpub\cementi\
```

After extraction, verify the folders exist:
```powershell
ls C:\inetpub\cementi\public\foto\      # should list year folders (2001, 2005, ...)
ls C:\inetpub\cementi\data\cementi.db   # should exist (~60 KB)
```

### Option B: SCP from the Linux VPS

If you have SSH access to the current server:

```powershell
# Database
scp user@host:/opt/cementi/data/cementi.db C:\inetpub\cementi\data\

# Photos, thumbnails, display copies, article icons
scp -r user@host:/opt/cementi/public/foto/ C:\inetpub\cementi\public\foto\
scp -r user@host:/opt/cementi/public/thumbs/ C:\inetpub\cementi\public\thumbs\
scp -r user@host:/opt/cementi/public/display/ C:\inetpub\cementi\public\display\
scp -r user@host:/opt/cementi/public/obrazky/articles/ C:\inetpub\cementi\public\obrazky\articles\
```

### Fresh database vs. transferred database

If you use the database from the zip or SCP, you get all existing users, comments, album metadata, and articles as-is.

If you skip the database transfer, the server creates a fresh one on first boot with:
- Two default users: `admin`/`admin` (full admin) and `test`/`test123` (comments only)
- Articles seeded from the HTML files in `data/articles/`
- Album metadata populated automatically by scanning `public/foto/`

Either way works — comments and user accounts are the only things you'd lose without the transferred database.

### Regenerating thumbnails

If for any reason thumbnails are missing or you add new photos manually:
```powershell
cd C:\inetpub\cementi
node generate-thumbnails.js
```
This scans `public\foto\` and generates WebP thumbnails + display copies for any photos that don't already have them. It can take a few minutes on the first run.

## 4. Set environment variables

Create `C:\inetpub\cementi\.env` (or set system-level environment variables):

```
SESSION_SECRET=generate_a_random_64_char_string_here
PORT=3000
```

Generate a random secret:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 5. Test run

```powershell
cd C:\inetpub\cementi
$env:SESSION_SECRET = "your_secret_from_previous_step"
node server.js
```

Open http://localhost:3000 in a browser — you should see the site with all photos and articles.

Stop with Ctrl+C after verification.

## 6. Install as a Windows Service

So Node runs in the background, survives reboots, and auto-restarts on crash:

```powershell
cd C:\inetpub\cementi
npm install node-windows
```

Create `install-service.js`:

```javascript
var Service = require('node-windows').Service;

var svc = new Service({
    name: 'Cementi',
    description: 'Cementi - VUT Brno 1988 reunion website',
    script: 'C:\\inetpub\\cementi\\server.js',
    env: [
        { name: 'PORT', value: '3000' },
        { name: 'SESSION_SECRET', value: 'REPLACE_WITH_YOUR_SECRET' },
        { name: 'NODE_ENV', value: 'production' }
    ]
});

svc.on('install', function () {
    svc.start();
    console.log('Cementi service installed and started.');
});

svc.install();
```

Run it:
```powershell
node install-service.js
```

The service appears in `services.msc` as "Cementi". It starts automatically on Windows boot.

To uninstall, create `uninstall-service.js`:
```javascript
var Service = require('node-windows').Service;
var svc = new Service({ name: 'Cementi', script: 'C:\\inetpub\\cementi\\server.js' });
svc.on('uninstall', function () { console.log('Service uninstalled.'); });
svc.uninstall();
```

## 7. IIS reverse proxy

IIS accepts requests on port 80/443 and forwards them to Node on localhost:3000.

### IIS module prerequisites

Install these IIS modules if not already present:

1. **URL Rewrite** — https://www.iis.net/downloads/microsoft/url-rewrite
2. **Application Request Routing (ARR)** — https://www.iis.net/downloads/microsoft/application-request-routing

After installation, in IIS Manager:
1. Click the server root → Application Request Routing → Server Proxy Settings
2. Check **Enable proxy** → Apply

### Create the website

1. IIS Manager → Sites → right-click → **Add Website**
   - Site name: `Cementi`
   - Physical path: `C:\inetpub\cementi\public` (for static files)
   - Binding: port 80, hostname: `cementi.cz` (or leave blank for IP-based)
2. Click the new site → **URL Rewrite** → Add Rule → **Reverse Proxy**
   - Inbound: `localhost:3000`
   - Check "Enable SSL Offloading" if you'll handle HTTPS at the IIS level

Alternatively, drop this `web.config` into `C:\inetpub\cementi\`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <system.webServer>
        <rewrite>
            <rules>
                <rule name="ReverseProxyInboundRule" stopProcessing="true">
                    <match url="(.*)" />
                    <action type="Rewrite" url="http://localhost:3000/{R:1}" />
                </rule>
            </rules>
        </rewrite>
    </system.webServer>
</configuration>
```

## 8. HTTPS (SSL certificate)

### Option A: Let's Encrypt (free, auto-renewing)

Download **win-acme** from https://www.win-acme.com/:

```powershell
# Download and extract
Invoke-WebRequest -Uri "https://github.com/win-acme/win-acme/releases/latest/download/win-acme.v2.x.x.x64.pluggable.zip" -OutFile wacs.zip
Expand-Archive wacs.zip -DestinationPath C:\Tools\wacs

# Run the interactive wizard
C:\Tools\wacs\wacs.exe
```

The wizard asks for the domain and automatically configures the IIS HTTPS binding. Certificate renewal is handled via a scheduled task.

### Option B: Corporate certificate

If you have your own certificate (PFX):

1. IIS Manager → Server Certificates → Import
2. On the Cementi site → Bindings → Add → HTTPS, port 443, select the certificate
3. Check "Require Server Name Indication" if multiple sites run on the same server

## 9. Post-migration: enable secure cookies

Once HTTPS is working, edit `server.js` — add `secure: true`:

```javascript
cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax', httpOnly: true, secure: true }
```

## 10. Deploying updates

There's no `deploy_linux.sh` on Windows. Updates are done manually:

```powershell
cd C:\inetpub\cementi

# Pull new code
git pull

# Update dependencies (if changed)
npm install --production

# Restart the service
net stop Cementi
net start Cementi
```

Or create a `deploy.ps1` PowerShell script:

```powershell
Set-Location C:\inetpub\cementi
git pull origin main
npm install --production
Restart-Service Cementi
Write-Host "Deploy complete." -ForegroundColor Green
```

## Directory structure on Windows

```
C:\inetpub\cementi\
├── server.js
├── package.json
├── web.config              ← IIS reverse proxy rule
├── install-service.js      ← Windows Service installer script
├── .env                    ← SESSION_SECRET (not in git)
├── lib\                    ← application logic
├── routes\                 ← Express routers
├── data\
│   ├── cementi.db          ← SQLite database
│   └── articles\           ← article seed content
├── public\
│   ├── css\
│   ├── js\
│   ├── fonts\              ← self-hosted web fonts
│   ├── obrazky\
│   ├── foto\               ← original photos
│   ├── thumbs\             ← thumbnails (400x300 WebP)
│   └── display\            ← display copies (2000px WebP)
└── node_modules\
```

## Troubleshooting

### `npm install` fails on native modules
```powershell
npm install --global windows-build-tools
# or
npm install --global node-gyp
```

### Port 3000 is already in use
Change `PORT` in `.env` to another value (e.g. 3001) and update `web.config` and `install-service.js` accordingly.

### Service won't start
Check the event log:
```powershell
Get-EventLog -LogName Application -Source "Cementi" -Newest 10
```
Or run Node directly to see errors:
```powershell
cd C:\inetpub\cementi
$env:SESSION_SECRET = "test"; node server.js
```

### Photos not showing
Verify that `public\foto\`, `public\thumbs\`, and `public\display\` contain files, and that the IIS Application Pool identity has read permissions on them.

### File paths
The code uses `path.join()` everywhere — Windows backslashes are handled automatically. No code changes required.

## Common tasks

### Adding photos

Two ways — both work on Windows the same as on Linux:

1. **Admin UI** (easiest): Log in as admin → `/admin` → click "Upravit" on an album → drag-and-drop files into the upload form. Thumbnails are generated automatically.

2. **Manual**: Drop files into `public\foto\YEAR\`, then run `node generate-thumbnails.js`.

### Managing users

All user management is in the admin panel at `/admin` → Uživatelé section:
- Create new users with the inline form
- Edit display names and reset passwords inline
- Delete users (their comments are deleted too)
- Toggle admin privileges with the checkbox

There is no self-registration — only admins can create accounts.

### Changing the admin password

Log in as admin → `/admin` → in the Uživatelé table, find the `admin` row → type a new password in the "Nové heslo" field → click "Uložit".

## Linux vs Windows comparison

| | Linux (current) | Windows Server |
|---|---|---|
| Web server | nginx | IIS + ARR |
| Process manager | PM2 | Windows Service (node-windows) |
| SSL | Certbot | win-acme or corporate cert |
| Deploy | `./deploy_linux.sh` (rsync) | `git pull` + restart service |
| Paths | `/opt/cementi/` | `C:\inetpub\cementi\` |
| Auto-start | `pm2 startup` | Windows Service (automatic) |
| Application code | **no changes** | **no changes** |
