import { useState, useRef, useEffect } from "react";
import { Send, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ChatMessage } from "@/components/ChatMessage";
import { VehicleMessage } from "@/components/VehicleMessage";
import { ImageUpload } from "@/components/ImageUpload";
import { Header } from "@/components/Header";
import { extractVehicleInfoFromImage, chatWithGemini, type VehicleInfo } from "@/services/geminiService";
import { searchParts } from "@/data/partsDatabase";

interface Message {
  role: 'user' | 'assistant' | 'vehicle';
  content: string;
  vehicleInfo?: VehicleInfo;
}

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  // Track last intent to recombine with clarifications like "avant", "droite", etc.
  const lastIntentRef = useRef<string | null>(null);
  // Track if last AI message was a clarification question
  const lastWasClarificationRef = useRef<boolean>(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [showUpload, setShowUpload] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleImageUpload = async (imageData: string) => {
    setIsProcessingImage(true);
    try {
      const info = await extractVehicleInfoFromImage(imageData);
      const infoWithId = { ...info, id: Date.now() };

      // Add vehicle to list
      setVehicles(prev => [...prev, infoWithId]);

      // Add vehicle message to chat
      setMessages(prev => [...prev, {
        role: 'vehicle',
        content: '',
        vehicleInfo: infoWithId
      }]);

      // Add assistant response - first vehicle gets welcome message
      const vehicleCount = vehicles.length + 1;
      if (vehicleCount === 1) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Merci !\nDemandez vos pièces de rechange en toute simplicité.`
        }]);
        setShowUpload(false); // Hide upload after first vehicle
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Super ! J'ai ajouté un autre véhicule à ta liste (${vehicleCount} au total) 🔧`
        }]);
      }

      toast({
        title: "✅ Carte grise analysée",
        description: `${info.marque} ${info.modele} ajouté avec succès`,
      });
    } catch (error: any) {
      const isInvalidModel = error?.message === 'INVALID_MODEL';
      toast({
        title: "❌ Carte grise refusée",
        description: isInvalidModel 
          ? "Seules les cartes grises Suzuki Celerio et S-Presso sont acceptées." 
          : "Impossible d'analyser l'image. Réessayez avec une meilleure qualité.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Update a vehicle (by id) and sync messages that reference it
  const handleUpdateVehicle = (id?: number, updates?: Partial<VehicleInfo>) => {
    if (!id) return;
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v));
    setMessages(prev => prev.map(m => {
      if (m.role === 'vehicle' && m.vehicleInfo && m.vehicleInfo.id === id) {
        return { ...m, vehicleInfo: { ...m.vehicleInfo, ...updates } };
      }
      return m;
    }));
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    let userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    setShowUpload(false);

    try {
      // Build context with selected vehicle (first only)
      let context = '';
      let selectedModel: 'celerio' | 'spresso' | 'both' | undefined = undefined;
      if (vehicles.length > 0) {
        const v = vehicles[0];
        context = `Véhicule sélectionné:\n- ${v.marque} ${v.modele} (${v.immatriculation})\n\nRÉPONDS UNIQUEMENT POUR CE MODÈLE.`;
        const modeleNorm = (v.modele || '').toLowerCase().replace(/\s+/g, '');
        if (modeleNorm.includes('celerio')) selectedModel = 'celerio';
        else if (modeleNorm.includes('spresso') || modeleNorm.includes('s-presso')) selectedModel = 'spresso';
      }

      // Detect small talk/merci and short-circuit with courteous reply
      // Only treat as small talk if it's ONLY a remerciement, not followed by a part request
      const smallTalkOnly = /^(merci|thank you|thx|shukran|yaatik issaha|bravo|sa7a)(\s|$)/i.test(userMessage);
      const isOnlySmallTalk = smallTalkOnly && userMessage.split(/\s+/).length <= 2;
      
      if (isOnlySmallTalk) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Avec plaisir 🙏. N'hésite pas si tu as besoin d'une autre pièce pour ton ${vehicles[0]?.modele || 'véhicule'} !` }]);
        return;
      }

      // Let Gemini handle the search and interpretation intelligently
      // Import parts databases
      const { spressoParts } = await import('@/data/spressoPartsDatabase');
      const { celerioParts } = await import('@/data/celerioPartsDatabase');

      // Build full parts database context for Gemini to search
      let allParts: any[] = [];
      if (selectedModel === 'spresso') {
        allParts = spressoParts;
      } else if (selectedModel === 'celerio') {
        allParts = celerioParts;
      } else {
        allParts = [...spressoParts, ...celerioParts];
      }

      // Format parts database for Gemini with smart filtering
      // Normalize text (remove accents, punctuation, lowercase)
      const normalize = (s: string) =>
        s
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // remove accents
          .replace(/[^a-z0-9\s-]/g, ' ') // keep alnum, space, dash
          .replace(/\s+/g, ' ')
          .trim();

      const query = normalize(userMessage);
      const relevantParts = allParts
        .filter((p: any) => {
          const designation = normalize(p.designation);
          const reference = normalize(p.reference);
          
          // Keep parts that match the query in some way
          return query.split(' ').some(word => 
            word.length >= 3 && (
              designation.includes(word) ||
              reference.includes(word) ||
              word.startsWith(designation.split(' ')[0]) ||
              designation.split(' ')[0].startsWith(word)
            )
          );
        });

      // If no relevant parts found based on query, include all parts
      const partsToInclude = relevantParts.length > 0 ? relevantParts : allParts;
      
      // Format final database for Gemini, limited to 200 most relevant parts
      const partsDatabase = partsToInclude.slice(0, 200).map((p: any) => ({
        reference: p.reference,
        designation: p.designation,
        price: p.priceHT,
        stock: p.stock,
        type: p.vehicleType,
        model: p.model
      }));

      context += `\n\nBASE DE DONNÉES DES PIÈCES (${selectedModel || 'tous modèles'}) - ${allParts.length} pièces disponibles:\n`;
      context += JSON.stringify(partsDatabase, null, 2);
      context += `\n\nINSTRUCTIONS POUR LA RECHERCHE:
- L'utilisateur cherche: "${userMessage}"
- Tu dois chercher dans la base de données ci-dessus les pièces correspondantes
- Utilise la logique intelligente pour matcher même avec typos, darija, ou descriptions imprécises
- Si plusieurs variantes existent (ex: radiateur refroidissement vs chauffage), pose une question de clarification
- Si des pièces sont trouvées, affiche UNIQUEMENT les meilleures correspondances (max 3)
- Format de réponse pour les pièces trouvées:
  * **DESIGNATION (Réf: REFERENCE)** Prix HT: PRIX TND, Stock: STOCK_STATUS
- Si aucune pièce trouvée, indique "Non disponible dans la base"`;

      const response = await chatWithGemini(
        userMessage,
        messages.filter(m => m.role !== 'vehicle').map(m => ({ role: m.role, content: m.content })),
        context
      );

      // Detect if this response is a clarification question (contains "?" and is short)
      const isClarificationResponse = response.includes('?') && response.length < 200;
      lastWasClarificationRef.current = isClarificationResponse;

      // Add only the AI response (avoid pre-listing from UI to prevent double messages)
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de traiter votre demande. Réessayez.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container max-w-4xl mx-auto p-4 h-screen flex flex-col">
        <Header vehicleCount={vehicles.length} />
        <Separator className="mb-4" />

        {/* Upload screen - shown when no vehicles */}
        {vehicles.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 animate-in fade-in-50">
            <div className="text-center space-y-4 max-w-md">
              <div className="w-28 h-28 mx-auto">
                <img 
                  src="/logosuz.png" 
                  alt="Suzuki Logo" 
                  className="w-full h-full object-contain"
                />
              </div>
              <h2 className="text-2xl font-bold text-foreground">
                Assistant Suzuki Pièces
              </h2>
              <p className="text-muted-foreground">
                Bonjour merci de télécharger  votre carte grise Suzuki Celerio ou S-Presso pour commencer
              </p>
            </div>
            <ImageUpload 
              onImageUpload={handleImageUpload}
              isProcessing={isProcessingImage}
            />
          </div>
        )}

        {/* Chat screen - shown when vehicles are registered */}
        {vehicles.length > 0 && (
          <>

          <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 pb-4">
            {messages.map((message, index) => {
              if (message.role === 'vehicle' && message.vehicleInfo) {
                return <VehicleMessage key={index} vehicle={message.vehicleInfo} onUpdate={(updates) => handleUpdateVehicle(message.vehicleInfo?.id, updates)} />;
              }
              if (message.role === 'user' || message.role === 'assistant') {
                return <ChatMessage key={index} role={message.role} content={message.content} />;
              }
              return null;
            })}
            
            {isLoading && (
              <div className="flex gap-3 p-4 rounded-xl bg-gradient-to-br from-muted/80 to-muted/40 mr-8 border border-border/50 animate-in fade-in-50">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent/80 shadow-sm">
                  <div className="h-2.5 w-2.5 bg-accent-foreground rounded-full animate-pulse" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Je réfléchis...</p>
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
          </ScrollArea>

          {showUpload && (
            <div className="mb-4 animate-in fade-in-50 slide-in-from-bottom-4">
              <ImageUpload 
                onImageUpload={handleImageUpload}
                isProcessing={isProcessingImage}
              />
            </div>
          )}

          <div className="pt-4 space-y-3">
            
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Demandez une pièce, un prix, un stock..."
                disabled={isLoading}
                className="flex-1 shadow-sm focus:shadow-md transition-shadow"
              />
              <Button 
                onClick={handleSend} 
                disabled={isLoading || !input.trim()}
                size="icon"
                className="shadow-sm hover:shadow-md transition-shadow"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              CarPro • Expert en pièces Suzuki • Celerio & S-Presso
            </p>
          </div>
        </>
        )}
      </div>
    </div>
  );
};

export default Index;
