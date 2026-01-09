import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * Custom styled dropdown component to replace native <select>
 * @param {Object} props
 * @param {string} props.value - Current selected value
 * @param {Function} props.onChange - Called with new value when selection changes
 * @param {Array<{value: string, label: string}>} props.options - Array of options
 * @param {string} props.placeholder - Placeholder text when no value selected
 * @param {string} props.className - Additional classes for the trigger button
 * @param {string} props.color - Theme color: "green" (default for branch) or "blue" (for warehouse)
 */
export default function CustomSelect({ value, onChange, options, placeholder = "Select...", className = "", color = "green" }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Color theme classes
  const colorClasses = {
    green: {
      ring: "focus:ring-emerald-500",
      selected: "bg-emerald-50 text-emerald-700",
      check: "text-emerald-600"
    },
    blue: {
      ring: "focus:ring-blue-500",
      selected: "bg-blue-50 text-blue-700",
      check: "text-blue-600"
    }
  };
  
  const theme = colorClasses[color] || colorClasses.green;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);
  const displayText = selectedOption?.label || placeholder;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-left cursor-pointer shadow-sm hover:border-neutral-300 hover:shadow focus:outline-none focus:ring-2 ${theme.ring} focus:border-transparent flex items-center justify-between gap-2 transition-all ${className}`}
      >
        <span className={value ? "text-neutral-800" : "text-neutral-500"}>{displayText}</span>
        <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto p-1">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center justify-between rounded-lg ${
                value === option.value 
                  ? `${theme.selected} font-medium` 
                  : "text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              <span>{option.label}</span>
              {value === option.value && <Check className={`w-4 h-4 ${theme.check}`} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
