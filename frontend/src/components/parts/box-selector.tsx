import { useGetBoxes, type BoxWithUsageSchemaList_a9993e3_BoxWithUsageSchema } from '@/lib/api/generated/hooks';

interface BoxSelectorProps {
  value?: number;
  onChange: (value: number | undefined) => void;
  error?: string;
  placeholder?: string;
  testId?: string;
}

export function BoxSelector({ 
  value, 
  onChange, 
  error, 
  placeholder = "Select box...",
  testId
}: BoxSelectorProps) {
  const { data: boxes = [], isLoading } = useGetBoxes();

  return (
    <div className="relative">
      <select
        value={value?.toString() || ''}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
        disabled={isLoading}
        data-testid={testId}
        aria-label="Box selector"
        className={`
          flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background 
          text-foreground
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
          disabled:cursor-not-allowed disabled:opacity-50
          ${error ? 'border-destructive focus-visible:ring-destructive' : ''}
        `}
      >
        <option value="" className="bg-background text-foreground">
          {isLoading ? 'Loading boxes...' : placeholder}
        </option>
        {boxes.map((box: BoxWithUsageSchemaList_a9993e3_BoxWithUsageSchema) => (
          <option key={box.box_no} value={box.box_no} className="bg-background text-foreground">
            #{box.box_no} {box.description}
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
