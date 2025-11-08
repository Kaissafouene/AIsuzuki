import { useState } from "react";
import { Car, Calendar, Settings, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { VehicleInfo } from "@/services/geminiService";
import { cn } from "@/lib/utils";

interface VehicleMessageProps {
  vehicle: VehicleInfo;
  onUpdate?: (updates: Partial<VehicleInfo>) => void;
}

export function VehicleMessage({ vehicle, onUpdate }: VehicleMessageProps) {
  const [isEditingImmat, setIsEditingImmat] = useState(false);
  const [immatInput, setImmatInput] = useState(vehicle.immatriculation || vehicle.immatriculationRaw || '');
  const getModelBadge = () => {
    const model = vehicle.modele?.toLowerCase();
    if (model?.includes('celerio')) return { name: 'Celerio', color: 'bg-primary' };
    if (model?.includes('s-presso') || model?.includes('spresso')) return { name: 'S-Presso', color: 'bg-secondary' };
    return null;
  };

  const modelBadge = getModelBadge();

  return (
    <div className="flex gap-3 p-4 rounded-xl bg-card text-card-foreground border border-border shadow-sm animate-in fade-in-50 slide-in-from-bottom-3 mr-8">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/10 shadow-sm">
        <CheckCircle2 className="h-5 w-5 text-primary" />
      </div>
      
      <div className="flex-1 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-primary" />
              <p className="font-semibold text-sm">Véhicule identifié</p>
            </div>
            {modelBadge && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {vehicle.marque} {modelBadge.name} {vehicle.annee}
              </p>
            )}
          </div>
          {modelBadge && (
            <Badge className={cn(modelBadge.color, "text-white shadow-sm text-xs px-3 py-1")}> 
              {modelBadge.name}
            </Badge>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-sm">
          {vehicle.immatriculation && !isEditingImmat && (
            <div className="col-span-2 flex items-center gap-2">
              <span className="text-muted-foreground">Immatriculation:</span>
              <span className="font-mono bg-primary/5 px-3 py-1.5 rounded-md border border-primary/20 font-semibold tracking-wide text-primary">
                {vehicle.immatriculation}
              </span>
              {vehicle.immatriculationWarning && (
                <button
                  onClick={() => { setIsEditingImmat(true); setImmatInput(vehicle.immatriculation || vehicle.immatriculationRaw || ''); }}
                  className="ml-2 text-xs underline text-primary hover:text-primary/80 transition-colors"
                >
                  Corriger
                </button>
              )}
            </div>
          )}

          {/* Editing immatriculation inline */}
          {isEditingImmat && (
            <div className="col-span-2 flex items-center gap-2">
              <span className="text-muted-foreground">Immat:</span>
              <input
                className="font-mono bg-background/50 px-2 py-1 rounded border border-border font-medium w-40"
                value={immatInput}
                onChange={(e) => setImmatInput(e.target.value)}
              />
              <button
                onClick={() => {
                  // normalize input
                  const cleaned = immatInput.trim().toUpperCase().replace(/[^A-Z0-9\- ]/g, '');
                  onUpdate?.({ immatriculation: cleaned, immatriculationWarning: undefined });
                  setIsEditingImmat(false);
                }}
                className="text-sm text-white bg-primary px-2 py-1 rounded"
              >
                Sauvegarder
              </button>
              <button
                onClick={() => { setIsEditingImmat(false); setImmatInput(vehicle.immatriculation || vehicle.immatriculationRaw || ''); }}
                className="text-sm underline text-muted-foreground ml-2"
              >
                Annuler
              </button>
            </div>
          )}

          {/* If no immatriculation but raw exists, show suggestion with edit action */}
          {!vehicle.immatriculation && !isEditingImmat && vehicle.immatriculationRaw && (
            <div className="col-span-2 flex items-center gap-2">
              <span className="text-muted-foreground">Immat (proposée):</span>
              <span className="font-mono bg-background/50 px-2 py-1 rounded border border-border font-medium">
                {vehicle.immatriculationRaw}
              </span>
              <button
                onClick={() => { setIsEditingImmat(true); setImmatInput(vehicle.immatriculationRaw || ''); }}
                className="ml-2 text-xs underline text-primary"
              >
                Corriger
              </button>
            </div>
          )}
          
          <div className="col-span-2 mt-2 grid grid-cols-3 gap-4">
            {vehicle.marque && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-primary">Marque</span>
                <span className="text-sm">{vehicle.marque}</span>
              </div>
            )}
            
            {vehicle.modele && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-primary">Modèle</span>
                <span className="text-sm">{vehicle.modele}</span>
              </div>
            )}
            
            {vehicle.annee && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-primary">Année</span>
                <span className="text-sm">{vehicle.annee}</span>
              </div>
            )}
          </div>
          
          {vehicle.typeMoteur && (
            <div className="col-span-2 flex items-center gap-2 mt-2 bg-muted/50 px-3 py-2 rounded-md">
              <Settings className="h-4 w-4 text-primary" />
              <span className="text-sm">{vehicle.typeMoteur}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
