import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { forgotPasswordSchema, resetPasswordSchema } from '@lifeledger/shared';
import { Button, ErrorText, Field, H1, P, Screen, fieldErrors } from '@/components/ui';
import { ApiError, rawRequest } from '@/lib/api';

export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const send = useMutation({
    mutationFn: (body: { email: string }) => rawRequest('/auth/forgot-password', { method: 'POST', body }),
    onSuccess: () => setStep('code'),
  });
  const reset = useMutation({
    mutationFn: (body: { email: string; code: string; newPassword: string }) =>
      rawRequest('/auth/reset-password', { method: 'POST', body }),
    onSuccess: () =>
      router.replace({ pathname: '/sign-in', params: { email, notice: 'Password changed. Sign in with your new password.' } }),
  });
  const err = (e: unknown) => (e instanceof ApiError ? e.message : e ? 'Something went wrong' : null);

  if (step === 'email') {
    const submit = () => {
      const p = forgotPasswordSchema.safeParse({ email });
      setErrors(p.success ? {} : fieldErrors(p.error.issues));
      if (p.success) send.mutate(p.data);
    };
    return (
      <Screen narrow>
        <H1>Forgot password</H1>
        <P className="mb-6">Enter your email and we&apos;ll send you a 6-digit code. It&apos;s valid for 10 minutes.</P>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          onSubmitEditing={submit}
        />
        <ErrorText>{err(send.error)}</ErrorText>
        <Button title="Send code" onPress={submit} loading={send.isPending} />
      </Screen>
    );
  }

  const submit = () => {
    const p = resetPasswordSchema.safeParse({ email, code, newPassword });
    setErrors(p.success ? {} : fieldErrors(p.error.issues));
    if (p.success) reset.mutate(p.data);
  };
  return (
    <Screen narrow>
      <H1>Enter code</H1>
      <P className="mb-6">If an account exists for {email}, a code is on its way.</P>
      <Field
        label="6-digit code"
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        error={errors.code}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
      />
      <Field
        label="New password"
        value={newPassword}
        onChangeText={setNewPassword}
        error={errors.newPassword}
        secureTextEntry
        autoComplete="new-password"
        onSubmitEditing={submit}
      />
      <ErrorText>{err(reset.error)}</ErrorText>
      <Button title="Set new password" onPress={submit} loading={reset.isPending} />
      <Button title="Send a new code" variant="ghost" className="mt-2" onPress={() => send.mutate({ email })} loading={send.isPending} />
    </Screen>
  );
}
