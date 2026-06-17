export interface Coverage {
  name: string;
  limit: string | null;
  deductible: string | null;
  premium: string | null;
}

export interface ParsedPolicyData {
  carrier: string;
  policyCategory: string;
  customPolicyLabel?: string | null;
  policyTypeCode: string;
  policyNumber: string;
  policyPeriodStart: string;
  policyPeriodEnd: string;
  effectiveDate: string;
  namedInsured: string;
  coInsured: string | null;
  insuredAddress: string;
  insuredCity: string;
  insuredState: string;
  insuredZip: string;
  insuredEmail: string | null;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleVIN: string;
  vehicleType: string;
  vehicleLength: string | null;
  vehicleUse: string;
  garagingZip: string;
  garagingState: string;
  propertyDescription: string;
  propertyAddress: string;
  propertyCity: string;
  propertyState: string;
  propertyZip: string;
  constructionType: string;
  occupancyType: string;
  yearBuilt: string;
  ratingBase: string | null;
  totalAnnualPremium: string;
  monthlyPayment: string | null;
  downPayment: string | null;
  paymentPlan: string;
  lienholderName: string | null;
  lienholderAddress: string | null;
  lienholderCityStateZip: string | null;
  coverages: Coverage[];
  discounts: string[];
  documentDate: string;
}

export interface Lienholder {
  name: string;
  address: string;
  cityStateZip: string;
}
