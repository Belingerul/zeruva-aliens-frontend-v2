"use client";

import { motion } from "framer-motion";

interface SpaceshipSlotProps {
  slotIndex: number;
  alien: {
    id: number;
    alien_id: number;
    image: string;
    tier: string;
    roi: number;
  } | null;
  onUnassign?: (alienDbId: number) => void;
  disabled?: boolean;
}

const rarityColors = {
  Common: "border-slate-400 shadow-slate-400/50",
  Rare: "border-blue-500 shadow-blue-500/50",
  Epic: "border-purple-500 shadow-purple-500/50",
  Legendary: "border-yellow-500 shadow-yellow-500/50",
};

export default function SpaceshipSlot({
  slotIndex,
  alien,
  onUnassign,
  disabled,
}: SpaceshipSlotProps) {
  const isEmpty = alien === null;

  const handleClick = () => {
    if (!isEmpty && onUnassign && !disabled && alien) {
      onUnassign(alien.id);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: slotIndex * 0.1 }}
      className="relative group"
    >
      <div
        onClick={handleClick}
        className={`
        w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-lg flex items-center justify-center
        border-2 transition-all duration-300
        ${isEmpty ? "border-gray-700 bg-gray-900/30" : `${rarityColors[alien.tier as keyof typeof rarityColors] || rarityColors.Common} bg-gray-900/50`}
        ${!isEmpty && !disabled && "hover:scale-105 cursor-pointer hover:border-red-500"}
        ${disabled && "opacity-50 cursor-not-allowed"}
      `}
      >
        {isEmpty ? (
          <svg
            className="w-8 h-8 md:w-10 md:h-10 text-gray-700"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M12 2L2 7L12 12L22 7L12 2Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M2 17L12 22L22 17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M2 12L12 17L22 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <img
            src={alien.image || "/placeholder.svg"}
            alt={`Alien #${alien.alien_id}`}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-contain p-1"
          />
        )}
      </div>

      {!isEmpty && alien && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black/90 border border-cyan-500/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
          <div className="text-sm space-y-1">
            <div className="text-cyan-400 font-semibold">
              Alien #{alien.alien_id}
            </div>
            <div className="text-gray-300">Tier: {alien.tier}</div>
            <div className="text-green-400">{alien.roi.toFixed(1)} $ / day</div>
            <div className="text-red-400 font-semibold mt-1 border-t border-gray-700 pt-1">
              Click to unassign
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
