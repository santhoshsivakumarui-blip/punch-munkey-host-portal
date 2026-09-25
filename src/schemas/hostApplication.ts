import * as yup from 'yup';

export type HostEntityType = 'individual' | 'organisation';

export interface HostApplicationFormValues {
  entityType: HostEntityType;
  phoneE164: string;
  otp: string;
  legalEntity: string;
  displayName: string;
}

// Matches identity-service/src/routes/hosts.ts's own validation exactly
// (phoneE164 + otp required strings, legalEntity/displayName non-empty
// after trim, entityType one of the two enum values) — client-side checks
// here are a UX head start, the server re-validates regardless.
export const hostApplicationSchema: yup.ObjectSchema<HostApplicationFormValues> = yup.object({
  entityType: yup
    .mixed<HostEntityType>()
    .oneOf(['individual', 'organisation'])
    .required('Choose whether you\'re applying as yourself or as a business.'),
  phoneE164: yup
    .string()
    .trim()
    .matches(/^\+91\d{10}$/, 'Enter a 10-digit number as +91XXXXXXXXXX.')
    .required('Phone number is required.'),
  otp: yup
    .string()
    .trim()
    .matches(/^\d{6}$/, 'Enter the 6-digit code.')
    .required('Enter the code sent to your phone.'),
  legalEntity: yup.string().trim().required('Legal entity name is required.'),
  displayName: yup.string().trim().required('Display name is required.'),
});
