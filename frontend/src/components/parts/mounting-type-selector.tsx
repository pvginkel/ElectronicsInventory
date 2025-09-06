interface MountingTypeSelectorProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  error?: string;
  placeholder?: string;
}

const MOUNTING_TYPES = [
  { value: 'Through-Hole', label: 'Through-Hole' },
  { value: 'Surface-Mount', label: 'Surface-Mount' },
  { value: 'Panel Mount', label: 'Panel Mount' },
  { value: 'DIN Rail Mount', label: 'DIN Rail Mount' },
];

export function MountingTypeSelector({ 
  value, 
  onChange, 
  error, 
  placeholder = "Select mounting type..." 
}: MountingTypeSelectorProps) {
  return (
    <div className="relative">
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={`
          flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background 
          text-foreground
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
          disabled:cursor-not-allowed disabled:opacity-50
          ${error ? 'border-destructive focus-visible:ring-destructive' : ''}
        `}
      >
        <option value="" className="bg-background text-foreground">{placeholder}</option>
        {MOUNTING_TYPES.map((type) => (
          <option key={type.value} value={type.value} className="bg-background text-foreground">
            {type.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-sm text-destructive mt-1">
          {error}
        </p>
      )}
    </div>
  );
}