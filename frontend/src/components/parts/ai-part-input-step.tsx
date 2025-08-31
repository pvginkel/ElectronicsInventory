import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { CameraCapture } from '@/components/documents/camera-capture';
import { Camera, Upload, X, FileImage } from 'lucide-react';

interface AIPartInputStepProps {
  onSubmit: (data: { text?: string; image?: File }) => void;
  isLoading?: boolean;
}

export function AIPartInputStep({ onSubmit, isLoading = false }: AIPartInputStepProps) {
  const [textInput, setTextInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = useCallback((file: File) => {
    setSelectedImage(file);
    
    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  }, []);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageSelect(file);
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleImageSelect]);

  const handleCameraCapture = useCallback((file: File) => {
    handleImageSelect(file);
    setShowCamera(false);
  }, [handleImageSelect]);

  const removeImage = useCallback(() => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setSelectedImage(null);
    setImagePreview(null);
  }, [imagePreview]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!textInput.trim() && !selectedImage) {
      return;
    }

    onSubmit({
      text: textInput.trim() || undefined,
      image: selectedImage || undefined
    });
  }, [textInput, selectedImage, onSubmit]);

  const canSubmit = (textInput.trim() || selectedImage) && !isLoading;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">Add Part with AI</h2>
        <p className="text-muted-foreground">
          Enter a part number, description, or take a photo to get started
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

        {/* Image Input Section */}
        <div className="space-y-3">
          <Label>Photo (Optional)</Label>
          
          {selectedImage ? (
            /* Image Preview */
            <Card className="p-4">
              <div className="flex items-center gap-4">
                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="Selected"
                    className="w-20 h-20 object-cover rounded border"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <FileImage className="h-4 w-4" />
                    <span className="text-sm font-medium">{selectedImage.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(selectedImage.size / 1024)} KB
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={removeImage}
                  disabled={isLoading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ) : (
            /* Image Upload Options */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Camera Button (Mobile-first) */}
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCamera(true)}
                disabled={isLoading}
                className="h-24 flex flex-col gap-2"
              >
                <Camera className="h-6 w-6" />
                <span className="text-sm">Take Photo</span>
              </Button>

              {/* File Upload */}
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="h-24 flex flex-col gap-2"
              >
                <Upload className="h-6 w-6" />
                <span className="text-sm">Upload Image</span>
              </Button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
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

      {/* Camera Modal */}
      <CameraCapture
        open={showCamera}
        onCapture={handleCameraCapture}
        onClose={() => setShowCamera(false)}
      />
    </div>
  );
}