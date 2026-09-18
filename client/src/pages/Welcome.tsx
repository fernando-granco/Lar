import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { setPrefs } from '@/lib/store';
import { BrandMark } from '@/components/Layout';
import { Button, Field, Input, IconButton, PALETTE, Avatar } from '@/components/ui';

/** First run: name the household and add its people. */
export function Welcome() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [people, setPeople] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const names = people.map((p) => p.trim()).filter(Boolean);
    if (!names.length) return setError('Add at least one person.');
    setBusy(true);
    try {
      // Create the first person, become them on this device, then add the rest so the activity log has a name.
      const first = await api.createMember({ name: names[0]!, color: PALETTE[0] });
      setPrefs({ memberId: first.id });
      if (name.trim()) await api.updateSettings({ household_name: name.trim() });
      for (const [i, n] of names.slice(1).entries()) await api.createMember({ name: n, color: PALETTE[(i + 1) % PALETTE.length] });
      await qc.invalidateQueries();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="welcome card">
      <div className="row" style={{ marginBottom: 20 }}>
        <BrandMark />
        <span className="display" style={{ fontSize: 20, fontWeight: 700 }}>Lar</span>
      </div>
      <h1>Welcome home.</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Lar is the family's home hub. Let's set up your household; you can change all of this later.
      </p>
      <form className="form" onSubmit={submit}>
        <Field label="Household name" hint="optional">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Granco home" maxLength={60} />
        </Field>
        <Field label="Who lives here?">
          <div className="stack">
            {people.map((p, i) => (
              <div className="row" key={i}>
                <Avatar member={{ name: p || '?', color: PALETTE[i % PALETTE.length]!, initials: p ? p.trim().slice(0, 1).toUpperCase() : '?' }} />
                <Input autoFocus={i === 0} value={p} onChange={(e) => setPeople(people.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 ? 'Your name' : 'Another person'} maxLength={40} />
                {people.length > 1 && <IconButton icon={X} label="Remove" onClick={() => setPeople(people.filter((_, j) => j !== i))} />}
              </div>
            ))}
            <Button variant="ghost" size="sm" icon={Plus} onClick={() => setPeople([...people, ''])} style={{ alignSelf: 'flex-start' }}>
              Add another person
            </Button>
          </div>
        </Field>
        {error && <p className="error">{error}</p>}
        <Button variant="primary" type="submit" block disabled={busy}>
          {busy ? 'Setting up…' : 'Start using Lar'}
        </Button>
      </form>
    </div>
  );
}
