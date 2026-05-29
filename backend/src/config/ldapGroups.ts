import { Group } from '../types';

export interface LdapGroupMapping {
  adGroup: string;   // exact CN of the AD group — get these names from IT
  site: string;      // facility code shown in the app, e.g. ABC
  appGroup: Group;   // maps to one of the 6 app roles
}

// ── UPDATE THESE WHEN YOU GET AD GROUP NAMES FROM IT ──────────────────────────
//
// Each entry maps one AD group → one site + one app role.
// The adGroup value is the CN (common name) of the group in Active Directory,
// NOT the full distinguished name. IT can confirm these.
//
// Example if your AD groups follow the pattern SITE_STO_RoleName:
//   ABC_STO_Receiving_Site, ABL_STO_Shipping_Planning, etc.
//
// A user only needs to be in ONE of these groups to get access.
// If they are in multiple, the first match in this list wins.
// ──────────────────────────────────────────────────────────────────────────────

export const LDAP_GROUP_MAPPINGS: LdapGroupMapping[] = [

  // ── Site ABC ──────────────────────────────────────────────────────────────
  { adGroup: 'ABC_STO_Receiving_Site',      site: 'ABC', appGroup: 'receiving_site' },
  { adGroup: 'ABC_STO_Shipping_Planning',   site: 'ABC', appGroup: 'shipping_planning' },
  { adGroup: 'ABC_STO_Shipping_Logistics',  site: 'ABC', appGroup: 'shipping_logistics' },
  { adGroup: 'ABC_STO_Management',          site: 'ABC', appGroup: 'management' },
  { adGroup: 'ABC_STO_Finance',             site: 'ABC', appGroup: 'finance' },
  { adGroup: 'ABC_STO_Receiving_Logistics', site: 'ABC', appGroup: 'receiving_logistics' },

  // ── Site ABL ──────────────────────────────────────────────────────────────
  { adGroup: 'ABL_STO_Receiving_Site',      site: 'ABL', appGroup: 'receiving_site' },
  { adGroup: 'ABL_STO_Shipping_Planning',   site: 'ABL', appGroup: 'shipping_planning' },
  { adGroup: 'ABL_STO_Shipping_Logistics',  site: 'ABL', appGroup: 'shipping_logistics' },
  { adGroup: 'ABL_STO_Management',          site: 'ABL', appGroup: 'management' },
  { adGroup: 'ABL_STO_Finance',             site: 'ABL', appGroup: 'finance' },
  { adGroup: 'ABL_STO_Receiving_Logistics', site: 'ABL', appGroup: 'receiving_logistics' },

  // ── Site XYZ ──────────────────────────────────────────────────────────────
  { adGroup: 'XYZ_STO_Receiving_Site',      site: 'XYZ', appGroup: 'receiving_site' },
  { adGroup: 'XYZ_STO_Shipping_Planning',   site: 'XYZ', appGroup: 'shipping_planning' },
  { adGroup: 'XYZ_STO_Shipping_Logistics',  site: 'XYZ', appGroup: 'shipping_logistics' },
  { adGroup: 'XYZ_STO_Management',          site: 'XYZ', appGroup: 'management' },
  { adGroup: 'XYZ_STO_Finance',             site: 'XYZ', appGroup: 'finance' },
  { adGroup: 'XYZ_STO_Receiving_Logistics', site: 'XYZ', appGroup: 'receiving_logistics' },

  // ── Add more sites here as needed ─────────────────────────────────────────
];

// Quick lookup: CN string → mapping entry
export function findMappingByAdGroup(cnName: string): LdapGroupMapping | undefined {
  return LDAP_GROUP_MAPPINGS.find(m => m.adGroup.toLowerCase() === cnName.toLowerCase());
}
