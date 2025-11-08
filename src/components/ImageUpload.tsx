import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  onImageUpload: (imageData: string) => void;
  isProcessing: boolean;
}

export function ImageUpload({ onImageUpload, isProcessing }: ImageUploadProps) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (file: File | null) => {
    if (!file) return;

    // Accept images (all formats) and PDFs
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
    const isValid = validTypes.includes(file.type) || file.type.startsWith('image/');
    
    if (!isValid) {
      toast({
        title: "Erreur",
        description: "Veuillez télécharger une image (PNG, JPG, JPEG, WEBP...) ou un PDF",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      onImageUpload(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileChange(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 overflow-hidden",
        isDragging 
          ? 'border-primary bg-primary/10 scale-[1.02]' 
          : 'border-border hover:border-primary/50 hover:bg-muted/30'
      )}
    >
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
      
      {/* Hidden input triggered programmatically for reliability across browsers */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif,application/pdf"
        className="hidden"
        onChange={(e) => handleFileChange(e.currentTarget.files?.[0] || null)}
        disabled={isProcessing}
      />

      <div className="cursor-pointer relative z-10" onClick={() => { if (!isProcessing) inputRef.current?.click(); }}>
        <div className="flex flex-col items-center gap-4">
          {isProcessing ? (
            <div className="relative">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <div className="absolute inset-0 blur-xl bg-primary/30 animate-pulse" />
            </div>
          ) : (
            <div className="relative group">
              <Upload className="h-12 w-12 text-primary transition-transform group-hover:scale-110 group-hover:-translate-y-1" />
              <div className="absolute inset-0 blur-2xl bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              {isProcessing ? 'Analyse en cours...' : 'Téléversez une carte grise'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isProcessing ? 'Extraction des informations du véhicule' : 'PNG, JPG, JPEG, WEBP, PDF • Glissez-déposez ou cliquez'}
            </p>
          </div>
          {!isProcessing && (
            <Button type="button" variant="outline" size="sm" className="shadow-sm hover:shadow-md transition-shadow" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Choisir un fichier
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
