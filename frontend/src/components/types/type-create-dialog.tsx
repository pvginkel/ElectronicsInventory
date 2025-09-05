import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface TypeCreateDialogProps {
  initialName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  open?: boolean;
}

export function TypeCreateDialog({ 
  initialName, 
  onConfirm, 
  onCancel, 
  isLoading,
  open = true 
}: TypeCreateDialogProps) {
  const [name, setName] = useState(initialName);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (name.trim()) {
      onConfirm(name);
    }
  };

  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Type</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={!name.trim() || isLoading}
              loading={isLoading}
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}