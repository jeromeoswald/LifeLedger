import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { signUpSchema } from '@lifeledger/shared';
import { Button, ErrorText, Field, H1, P, Screen, fieldErrors } from '@/components/ui';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { signUp } from '@/lib/session';
import { ApiError } from '@/lib/api';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('AED');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const m = useMutation({ mutationFn: signUp });

  const submit = () => {
    const parsed = signUpSchema.safeParse({ email, password, baseCurrency });
    const errs = parsed.success ? {} : fieldErrors(parsed.error.issues);
    if (password !== confirm) errs.confirm = "Passwords don't match";
    setErrors(errs);
    if (parsed.success && !errs.confirm) m.mutate(parsed.data);
  };

  return (
    <Screen narrow>
      <H1>Create account</H1>
      <P className="mb-6">It only takes a moment.</P>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Field
        label="Password (at least 8 characters)"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Field
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <CurrencyPicker label="Base currency" value={baseCurrency} onChange={setBaseCurrency} />
      <ErrorText>{m.error instanceof ApiError ? m.error.message : m.error ? 'Sign-up failed' : null}</ErrorText>
      <Button title="Create account" onPress={submit} loading={m.isPending} />
      <Button title="Already have an account? Sign in" variant="ghost" className="mt-2" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
