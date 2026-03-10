import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Globe } from '@phosphor-icons/react'
import { Language } from '@/lib/i18n'

interface LanguageSelectorProps {
  currentLanguage: Language
  onLanguageChange: (lang: Language) => void
}

export default function LanguageSelector({ currentLanguage, onLanguageChange }: LanguageSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Globe size={20} weight="duotone" className="text-muted-foreground" />
      <Select value={currentLanguage} onValueChange={(value) => onLanguageChange(value as Language)}>
        <SelectTrigger className="w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="es">🇺🇾 Español</SelectItem>
          <SelectItem value="en">🇺🇸 English</SelectItem>
          <SelectItem value="pt">🇧🇷 Português</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
