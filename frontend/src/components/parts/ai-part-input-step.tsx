import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AIPartInputStepProps {
  onSubmit: (data: { text: string }) => void;
  isLoading?: boolean;
}

export function AIPartInputStep({ onSubmit, isLoading = false }: AIPartInputStepProps) {
  const [textInput, setTextInput] = useState('');


  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!textInput.trim()) {
      return;
    }

    onSubmit({
      text: textInput.trim()
    });
  }, [textInput, onSubmit]);

  const canSubmit = textInput.trim() && !isLoading;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">Add Part with AI</h2>
        <p className="text-muted-foreground">
          Enter a part number or description to get started
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Text Input */}
        <div className="space-y-2">
          <Label htmlFor="text-input">
            Part Number or Description
          </Label>
          <Input
            id="text-input"
            type="text"
            placeholder="e.g., Arduino Uno R3, 555 timer, LM358"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={isLoading}
          />
          <p className="text-sm text-muted-foreground">
            Enter a manufacturer part number, model, or brief description
          </p>
        </div>


        {/* Submit Button */}
        <Button
          type="submit"
          disabled={!canSubmit}
          className="w-full"
        >
          {isLoading ? 'Analyzing...' : 'Analyze Part'}
        </Button>
      </form>

    </div>
  );
}