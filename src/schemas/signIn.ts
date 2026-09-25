import * as yup from 'yup';

export interface SignInFormValues {
  phoneE164: string;
  otp: string;
}

// Same phone/otp rules as hostApplicationSchema, minus legalEntity/displayName
// — sign-in only needs `POST /auth/otp/verify` (see lib/api.ts's verifyOtp).
export const signInSchema: yup.ObjectSchema<SignInFormValues> = yup.object({
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
});
