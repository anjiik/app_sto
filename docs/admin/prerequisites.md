# Prerequisites

Install these on the Windows server, in order. Each has a standard installer.

## Node.js (v20 LTS)

1. Download the **LTS** version (20.x) from [nodejs.org](https://nodejs.org).
2. Run the installer with defaults.
3. On the **"Tools for Native Modules"** screen, tick **"Automatically install
   necessary tools"** — this installs the Python + Visual Studio Build Tools that the
   SQL Server driver (`msnodesqlv8`) needs to compile.
4. Verify in a new Command Prompt:
   ```cmd
   node --version
   npm --version
   ```

## SQL Server ODBC Driver 17

The SQL Server driver requires this.

1. Download **"Microsoft ODBC Driver 17 for SQL Server"** from Microsoft.
2. Run the installer with defaults. No reboot needed.

## Git

1. Install from [git-scm.com](https://git-scm.com) with defaults.
2. Verify: `git --version`.

## PM2 (process manager)

After Node is installed, open **Command Prompt as Administrator**:

```cmd
npm install -g pm2
npm install -g pm2-windows-startup
```

## Get the code

**From GitHub** (if the machine has internet):

```cmd
cd C:\
git clone https://github.com/ak2254/app_sto.git sto-management
cd sto-management
```

**Or copy from another PC** (no internet): copy the entire project folder — including
the hidden `.git` folder — to `C:\sto-management`.

Next: [Database & migrations](database.md).
