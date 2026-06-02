import { useId, type ReactNode } from 'react';

export interface PlayerFigureProps {
  pose:
    | 'idle'
    | 'shooting'
    | 'passing'
    | 'rebounding'
    | 'celebrating'
    | 'blocked';
  teamColor: string;
  headshotUrl?: string;
  playerName?: string;
  size?: number;
}

const LIMB_COLOR = '#1f2937';

export function PlayerFigure({
  pose,
  teamColor,
  headshotUrl,
  playerName,
  size = 50,
}: PlayerFigureProps) {
  const clipPathId = `player-head-${useId().replace(/:/g, '')}`;

  const renderHead = (cy = 18): ReactNode => (
    <g>
      <defs>
        <clipPath id={clipPathId} clipPathUnits="userSpaceOnUse">
          <circle cx={50} cy={cy} r={14} />
        </clipPath>
      </defs>
      <circle
        cx={50}
        cy={cy}
        r={14}
        fill={teamColor}
        stroke={LIMB_COLOR}
        strokeWidth={1.5}
      />
      {headshotUrl && (
        <image
          href={headshotUrl}
          x={36}
          y={cy - 14}
          width={28}
          height={28}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clipPathId})`}
        />
      )}
    </g>
  );

  const renderPose = (): ReactNode => {
    switch (pose) {
      case 'shooting':
        return (
          <>
            <g
              transform="translate(0 -8)"
              fill="none"
              stroke={LIMB_COLOR}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={5}
            >
              <path d="M 59 43 C 64 33, 66 20, 66 5" />
              <path d="M 41 44 C 37 48, 36 53, 40 56" />
              <path d="M 45 88 C 46 98, 39 104, 32 113" />
              <path d="M 55 88 C 60 96, 67 100, 73 108" />
              <path
                d="M 40 34 Q 50 30, 60 34 L 62 72 L 60 90 Q 50 94, 40 90 L 38 72 Z"
                fill={teamColor}
                strokeWidth={1.5}
              />
              {renderHead()}
            </g>
            <circle
              cx={40}
              cy={48}
              r={6}
              fill="#f97316"
              stroke="#9a3412"
              strokeWidth={1.5}
            />
          </>
        );

      case 'passing':
        return (
          <g
            transform="rotate(-10 50 72)"
            fill="none"
            stroke={LIMB_COLOR}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={5}
          >
            <path d="M 59 45 C 69 46, 80 47, 92 45" />
            <path d="M 59 55 C 70 56, 82 55, 94 52" />
            <path d="M 44 88 C 40 99, 35 109, 29 121" />
            <path d="M 56 88 C 62 96, 65 108, 67 122" />
            <path
              d="M 40 34 Q 50 30, 60 34 L 63 73 L 60 90 Q 50 94, 39 90 L 37 72 Z"
              fill={teamColor}
              strokeWidth={1.5}
            />
            {renderHead()}
          </g>
        );

      case 'rebounding':
        return (
          <g
            transform="translate(0 -8)"
            fill="none"
            stroke={LIMB_COLOR}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={5}
          >
            <path d="M 42 43 C 40 31, 41 18, 43 4" />
            <path d="M 58 43 C 60 31, 59 18, 57 4" />
            <path d="M 44 88 C 42 103, 40 117, 38 133" />
            <path d="M 56 88 C 58 103, 60 117, 62 133" />
            <path
              d="M 40 34 Q 50 30, 60 34 L 62 72 L 60 90 Q 50 94, 40 90 L 38 72 Z"
              fill={teamColor}
              strokeWidth={1.5}
            />
            {renderHead()}
          </g>
        );

      case 'celebrating':
        return (
          <g
            fill="none"
            stroke={LIMB_COLOR}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={5}
          >
            <path d="M 41 43 C 34 33, 27 21, 18 10" />
            <path d="M 59 43 C 66 33, 73 21, 82 10" />
            <path d="M 44 88 C 42 103, 38 118, 34 133" />
            <path d="M 56 88 C 58 103, 62 118, 66 133" />
            <path
              d="M 40 34 Q 50 30, 60 34 L 62 72 L 60 90 Q 50 94, 40 90 L 38 72 Z"
              fill={teamColor}
              strokeWidth={1.5}
            />
            {renderHead(15)}
          </g>
        );

      case 'blocked':
        return (
          <g
            transform="rotate(6 50 72)"
            fill="none"
            stroke={LIMB_COLOR}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={5}
          >
            <path d="M 40 45 C 40 58, 44 70, 48 83" />
            <path d="M 60 45 C 63 57, 67 68, 72 79" />
            <path d="M 44 88 C 42 99, 37 109, 32 120" />
            <path d="M 56 88 C 61 97, 64 108, 66 120" />
            <path
              d="M 40 34 Q 50 32, 60 34 L 63 74 L 60 90 Q 50 94, 39 90 L 37 74 Z"
              fill={teamColor}
              strokeWidth={1.5}
            />
            {renderHead(22)}
          </g>
        );

      case 'idle':
      default:
        return (
          <g
            fill="none"
            stroke={LIMB_COLOR}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={5}
          >
            <path d="M 40 44 C 36 56, 35 69, 37 82" />
            <path d="M 60 44 C 64 56, 65 69, 63 82" />
            <path d="M 44 88 C 43 103, 40 118, 37 133" />
            <path d="M 56 88 C 57 103, 60 118, 63 133" />
            <path
              d="M 40 34 Q 50 30, 60 34 L 62 72 L 60 90 Q 50 94, 40 90 L 38 72 Z"
              fill={teamColor}
              strokeWidth={1.5}
            />
            {renderHead()}
          </g>
        );
    }
  };

  return (
    <svg
      viewBox="0 0 100 140"
      width={size}
      height={size * 1.4}
      role={playerName ? 'img' : undefined}
      aria-label={playerName}
    >
      {playerName && <title>{playerName}</title>}
      {renderPose()}
    </svg>
  );
}
