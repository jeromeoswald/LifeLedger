import { useState } from 'react';
import { Platform, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { signInSchema } from '@lifeledger/shared';
import { Button, ErrorText, Field, H1, P, Screen, fieldErrors } from '@/components/ui';
import { signIn } from '@/lib/session';
import { ApiError } from '@/lib/api';

export default function SignIn() {
  const params = useLocalSearchParams<{ email?: string; notice?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const m = useMutation({ mutationFn: signIn });

  const submit = () => {
    const parsed = signInSchema.safeParse({ email, password, rememberDevice: remember });
    setErrors(parsed.success ? {} : fieldErrors(parsed.error.issues));
    if (parsed.success) m.mutate(parsed.data);
  };

  return (
    <Screen narrow>
      <H1>Sign in</H1>
      {params.notice ? <P className="mb-4 text-teal-700 dark:text-teal-400">{params.notice}</P> : <View className="mb-4" />}
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
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      {Platform.OS === 'web' ? (
        <View className="mb-4 min-h-11 flex-row items-center justify-between">
          <Text className="text-base text-slate-700 dark:text-slate-200">Remember this device for 30 days</Text>
          <Switch value={remember} onValueChange={setRemember} accessibilityLabel="Remember this device" />
        </View>
      ) : null}
      <ErrorText>{m.error instanceof ApiError ? m.error.message : m.error ? 'Sign-in failed' : null}</ErrorText>
      <Button title="Sign in" onPress={submit} loading={m.isPending} />
      <Button
        title="Forgot password?"
        variant="ghost"
        className="mt-2"
        onPress={() => router.push({ pathname: '/forgot-password', params: { email } })}
      />
      <Button title="New here? Create an account" variant="ghost" onPress={() => router.replace('/sign-up')} />
    </Screen>
  );
}
