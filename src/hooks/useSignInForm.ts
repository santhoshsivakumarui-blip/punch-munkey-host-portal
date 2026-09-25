import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useNavigate } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { useToast } from '@jfc/ui-web';
import { requestOtpAtom, signInWithOtpAtom } from '../lib/atoms';
import { showApiError } from '../lib/toastError';
import { signInSchema } from '../schemas/signIn';
import type { SignInFormValues } from '../schemas/signIn';

/** Backs SignInPage (`3d`) — a returning host verifies with just phone +
 * otp against the shared `/auth/otp/verify` (lib/atoms.ts's
 * signInWithOtpAtom), not the heavier `POST /hosts/apply` sign-up uses. */
export function useSignInForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const requestOtp = useSetAtom(requestOtpAtom);
  const signIn = useSetAtom(signInWithOtpAtom);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const form = useForm<SignInFormValues>({
    resolver: yupResolver(signInSchema),
    defaultValues: { phoneE164: '', otp: '' },
  });

  async function requestOtpForPhone() {
    const phone = form.getValues('phoneE164');
    const valid = await form.trigger('phoneE164');
    if (!valid) return;
    try {
      await requestOtp(phone);
      setOtpSent(true);
      toast.show('Code sent — check the api-gateway console in dev', { tone: 'positive' });
    } catch (err) {
      setOtpSent(false);
      showApiError(toast, err, 'Could not send the code.');
    }
  }

  async function onSubmit(values: SignInFormValues) {
    setSubmitting(true);
    setSubmitError('');
    try {
      await signIn(values);
      navigate('/events', { replace: true });
    } catch (err) {
      const message = showApiError.messageFor(err, 'Could not sign in. Check the code and try again.');
      setSubmitError(message);
      toast.show(message, { tone: 'warning' });
    } finally {
      setSubmitting(false);
    }
  }

  return { form, requestOtp: requestOtpForPhone, onSubmit: form.handleSubmit(onSubmit), submitError, submitting, otpSent };
}
