# Firewall

Block direct access to the Node.js port (4000) from outside — all traffic should go
through IIS on 80/443.

Open **Windows Defender Firewall with Advanced Security** and add an **Inbound Rule**:

- **Rule type:** Port
- **Protocol / port:** TCP, specific port `4000`
- **Action:** **Block the connection**
- **Profile:** Domain, Private, Public
- **Name:** `Block direct STO backend access`

IIS on ports 80 and 443 normally already has allow rules. If not, add them the same
way but choose **Allow**.
