# IIS reverse proxy

IIS sits in front of the Node.js backend: it terminates HTTPS, serves the frontend
static files under `/sto/`, proxies `/api/*` to the backend, and (optionally) serves
**this documentation** at `/sto/docs/`.

## Install IIS

**Server Manager → Add Roles and Features → Web Server (IIS)**, or in PowerShell:

```powershell
Install-WindowsFeature -Name Web-Server -IncludeManagementTools
```

## Install the required modules

1. **URL Rewrite Module 2.1**
2. **Application Request Routing (ARR) 3.0**

After installing ARR: in **IIS Manager**, select the server node → **Application
Request Routing Cache** → **Server Proxy Settings** → tick **Enable proxy** → Apply.

## HTTPS certificate

- **From IT (preferred):** have a certificate issued for the server hostname and
  installed in IIS.
- **Self-signed (internal only):**
  ```powershell
  New-SelfSignedCertificate -DnsName "your-server-name.company.com" -CertStoreLocation "cert:\LocalMachine\My"
  ```
  Then in IIS Manager: **Sites → Default Web Site → Bindings → Add → HTTPS** and
  select the certificate.

## Configure the website

Point **Default Web Site** at the built frontend: **Basic Settings → Physical Path →**
`C:\sto-management\frontend\dist`.

Create `C:\sto-management\frontend\dist\web.config`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- Proxy /api/* to the Node.js backend on port 4000 -->
        <rule name="API Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:4000/api/{R:1}" />
        </rule>

        <!-- SPA fallback: non-file requests serve index.html -->
        <rule name="SPA Fallback" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>

    <staticContent>
      <mimeMap fileExtension=".webmanifest" mimeType="application/manifest+json" />
    </staticContent>
  </system.webServer>
</configuration>
```

Restart IIS:

```cmd
iisreset
```

## Serving these docs at `/sto/docs`

The documentation is a static site — build it and let IIS serve it as a sub-folder.

1. **Build the docs** (on any machine with the docs toolchain):
   ```bash
   pip install -r docs-requirements.txt
   mkdocs build          # produces the site/ folder
   ```
2. **Copy** the generated `site\` folder to the server as
   `C:\sto-management\frontend\dist\docs`.
3. Because the docs live *inside* the site's physical path, the existing SPA-fallback
   rule would try to hand `/docs/*` to the app. Add a rule **above** the SPA fallback
   so real doc files are served directly:

   ```xml
   <!-- Serve the docs folder as static files (place ABOVE the SPA Fallback rule) -->
   <rule name="Docs Passthrough" stopProcessing="true">
     <match url="^docs/(.*)" />
     <conditions logicalGrouping="MatchAll">
       <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
       <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
     </conditions>
     <action type="Rewrite" url="/docs/index.html" />
   </rule>
   ```

The docs are then browsable at **`https://<host>/sto/docs/`** — reachable by anyone who
can reach the app.

!!! note "Base path"
    The docs' `mkdocs.yml` sets `site_url` to the `/sto/docs/` path. Update it to your
    real host before building. In-page links are relative, so the site works even if
    the base path differs.
