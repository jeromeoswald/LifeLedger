import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { categorySchema, fromMinor, toMinor, type Category } from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { Button, Card, ErrorText, Field, P, Screen, SectionTitle, Segmented, fieldErrors } from '@/components/ui';
import { newBase, nowIso, saveRecord } from '@/lib/records';
import { useCategories } from '@/lib/wallet';
import { Money } from '@/components/wallet/Money';

/** Categories with optional monthly budgets (in the base currency). */
export default function Categories() {
  const { data: categories = [] } = useCategories();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const list = categories.filter((c) => !c.deletedAt && c.kind === kind).sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || a.name.localeCompare(b.name));

  return (
    <Screen>
      <Segmented
        label="Category kind"
        value={kind}
        onChange={(k) => {
          setKind(k);
          setEditing(null);
        }}
        options={[
          { value: 'expense', label: 'Expenses' },
          { value: 'income', label: 'Income' },
        ]}
      />
      {editing ? (
        <CategoryForm key={editing === 'new' ? 'new' : editing.clientId} existing={editing === 'new' ? undefined : editing} kind={kind} done={() => setEditing(null)} />
      ) : (
        <Button title={`+ New ${kind} category`} variant="secondary" onPress={() => setEditing('new')} className="mb-4" />
      )}
      <SectionTitle>{kind === 'expense' ? 'Expense categories' : 'Income categories'}</SectionTitle>
      {list.map((c) => (
        <Pressable
          key={c.clientId}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${c.name}`}
          onPress={() => setEditing(c)}
          className={`mb-2 min-h-12 flex-row items-center justify-between rounded-2xl bg-white px-4 py-3 dark:bg-slate-900 ${c.archivedAt ? 'opacity-50' : ''}`}
        >
          <Text className="text-base text-slate-900 dark:text-white">
            {c.icon} {c.name}
            {c.archivedAt ? ' (archived)' : ''}
          </Text>
          {c.monthlyBudgetMinor && c.budgetCurrency ? (
            <Money minor={c.monthlyBudgetMinor} currency={c.budgetCurrency} className="text-sm text-slate-500" />
          ) : (
            <Text className="text-sm text-slate-400">{kind === 'expense' ? 'No budget' : ''}</Text>
          )}
        </Pressable>
      ))}
      {!list.length ? <P>No categories yet.</P> : null}
    </Screen>
  );
}

function CategoryForm({ existing, kind, done }: { existing?: Category; kind: 'expense' | 'income'; done: () => void }) {
  const base = useAuth((s) => s.user?.baseCurrency ?? 'AED');
  const budgetCcy = existing?.budgetCurrency ?? base;
  const [name, setName] = useState(existing?.name ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? '');
  const [budget, setBudget] = useState(existing?.monthlyBudgetMinor ? fromMinor(existing.monthlyBudgetMinor, budgetCcy) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    let monthlyBudgetMinor: number | null = null;
    if (kind === 'expense' && budget.trim()) {
      try {
        monthlyBudgetMinor = toMinor(budget.trim(), budgetCcy) || null;
      } catch {
        setErrors({ monthlyBudgetMinor: 'Enter a number like 1500' });
        return;
      }
    }
    const parsed = categorySchema.safeParse({
      ...(existing ?? newBase()),
      name,
      kind,
      icon: icon.trim(),
      monthlyBudgetMinor,
      budgetCurrency: monthlyBudgetMinor ? budgetCcy : null,
    });
    setErrors(parsed.success ? {} : fieldErrors(parsed.error.issues));
    if (parsed.success && (await saveRecord('categories', parsed.data))) done();
  };

  return (
    <Card>
      <View className="flex-row gap-3">
        <View className="w-20">
          <Field label="Icon" value={icon} onChangeText={(t) => setIcon(t.slice(0, 4))} placeholder="🛒" />
        </View>
        <View className="flex-1">
          <Field label="Name" value={name} onChangeText={setName} error={errors.name} autoFocus />
        </View>
      </View>
      {kind === 'expense' ? (
        <Field
          label={`Monthly budget in ${budgetCcy} (optional)`}
          value={budget}
          onChangeText={(t) => setBudget(t.replace(/[^\d.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="e.g. 1500"
          error={errors.monthlyBudgetMinor}
        />
      ) : null}
      {kind === 'expense' ? <P className="-mt-2 mb-3 text-xs">You'll get an alert at 80% and at 100% of the budget.</P> : null}
      <ErrorText>{errors.form}</ErrorText>
      <View className="flex-row gap-2">
        <Button title="Save" onPress={() => void save()} className="flex-1" />
        <Button title="Cancel" variant="secondary" onPress={done} className="flex-1" />
      </View>
      {existing ? (
        <Button
          title={existing.archivedAt ? 'Unarchive' : 'Archive'}
          variant="ghost"
          className="mt-2"
          onPress={async () => {
            if (await saveRecord('categories', { ...existing, archivedAt: existing.archivedAt ? null : nowIso() })) done();
          }}
        />
      ) : null}
    </Card>
  );
}
