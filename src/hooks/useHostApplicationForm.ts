import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useNavigate } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { useToast } from '@jfc/ui-web';
import { requestOtpAtom, signInAtom } from '../lib/atoms';
import { showApiError } from '../lib/toastError';
import { hostApplicationSchema } from '../schemas/hostApplication';
import type { HostApplicationFormValues } from '../schemas/hostApplication';

/** Backs SignUpPage (`2c`) only — `POST /hosts/apply` is the one endpoint
 * that can create the `hosts` row (legalEntity/displayName), so sign-up
 * still needs all four fields. SignInPage has its own, lighter
 * useSignInForm.ts now that a returning host can verify with just
 * phone + otp (see lib/api.ts's verifyOtp / lib/atoms.ts's
 * signInWithOtpAtom). Always starts blank — there's no cached profile to
 * pre-fill from once sign-in stopped writing one. */
export function useHostApplicationForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const requestOtp = useSetAtom(requestOtpAtom);
  const signIn = useSetAtom(signInAtom);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const form = useForm<HostApplicationFormValues>({
    resolver: yupResolver(hostApplicationSchema),
    defaultValues: {
      entityType: 'organisation',
      phoneE164: '',
      otp: '',
      legalEntity: '',
      displayName: '',
    },
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

  async function onSubmit(values: HostApplicationFormValues) {
    setSubmitting(true);
    setSubmitError('');
    try {
      const { isNewApplication } = await signIn(values);
      navigate(isNewApplication ? '/verify-pending' : '/events', { replace: true });
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
