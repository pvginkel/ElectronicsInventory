import { useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { InformationBadge } from '@/components/ui';

interface TagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  error?: string;
}

export function TagsInput({ value = [], onChange, placeholder = "", error }: TagsInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      // Remove last tag when backspace is pressed on empty input
      removeTag(value.length - 1);
    }
  };

  const addTag = () => {
    const tag = inputValue.trim();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInputValue('');
  };

  const removeTag = (index: number) => {
    const newTags = value.filter((_, i) => i !== index);
    onChange(newTags);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 mb-2">
        {value.map((tag, index) => (
          <InformationBadge
            key={index}
            onRemove={() => removeTag(index)}
            testId={`parts.form.tag.${index}`}
          >
            {tag}
          </InformationBadge>
        ))}
      </div>
      
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          error={error}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          onClick={addTag}
          disabled={!inputValue.trim() || value.includes(inputValue.trim())}
          preventValidation
        >
          Add Tag
        </Button>
      </div>
    </div>
  );
}