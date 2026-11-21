import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Screen({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="grow px-4 py-6" keyboardShouldPersistTaps="handled">
          <View className={`w-full flex-1 self-center ${narrow ? 'max-w-md' : 'max-w-3xl'}`}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const H1 = ({ children }: { children: ReactNode }) => (
  <Text accessibilityRole="header" className="mb-2 text-3xl font-bold text-slate-900 dark:text-white">
    {children}
  </Text>
);

export const P = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <Text className={`text-base text-slate-600 dark:text-slate-300 ${className}`}>{children}</Text>
);

export const ErrorText = ({ children }: { children?: ReactNode }) =>
  children ? (
    <Text accessibilityRole="alert" className="my-2 text-sm text-red-600 dark:text-red-400">
      {children}
    </Text>
  ) : null;

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#94a3b8"
        className={`min-h-12 rounded-xl border bg-white px-4 text-base text-slate-900 dark:bg-slate-900 dark:text-white ${
          error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
        }`}
        {...props}
      />
      {error ? <Text className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</Text> : null}
    </View>
  );
}

const VARIANTS = {
  primary: { box: 'bg-brand active:bg-brand-dark', text: 'text-white' },
  secondary: { box: 'border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900', text: 'text-slate-900 dark:text-white' },
  danger: { box: 'bg-red-600 active:bg-red-700', text: 'text-white' },
  ghost: { box: '', text: 'text-brand dark:text-brand-light' },
} as const;

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  className = '',
}: {
  title: string;
  onPress: () => void;
  variant?: keyof typeof VARIANTS;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const v = VARIANTS[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      className={`min-h-12 flex-row items-center justify-center rounded-xl px-4 ${v.box} ${off ? 'opacity-50' : ''} ${className}`}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : '#0F766E'} /> : null}
      <Text className={`text-base font-semibold ${v.text} ${loading ? 'ml-2' : ''}`}>{title}</Text>
    </Pressable>
  );
}

/** Row of mutually exclusive options; each option is a 44px+ target. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="mb-4 flex-row flex-wrap gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            className={`min-h-11 justify-center rounded-full border px-4 ${
              selected ? 'border-brand bg-brand' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
            }`}
          >
            <Text className={selected ? 'font-semibold text-white' : 'text-slate-800 dark:text-slate-100'}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <View className={`mb-4 rounded-2xl bg-white p-4 dark:bg-slate-900 ${className}`}>{children}</View>
);

export const SectionTitle = ({ children }: { children: ReactNode }) => (
  <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
    {children}
  </Text>
);

/** Shows the first zod issue per field. */
export function fieldErrors(issues: { path: PropertyKey[]; message: string }[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? '');
    out[k] ??= i.message;
  }
  return out;
}
