import React from 'react';

interface SettingRowProps {
  label: string;
  description?: string;
  control: React.ReactNode;
  helper?: React.ReactNode;
  disabled?: boolean;
}

export default function SettingRow({
  label,
  description,
  control,
  helper,
  disabled = false,
}: SettingRowProps) {
  return (
    <div className={`settings-row ${disabled ? 'opacity-70' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-700 text-foreground">{label}</p>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        {helper ? <div className="mt-2 text-xs text-muted-foreground">{helper}</div> : null}
      </div>
      <div className="settings-control">{control}</div>
    </div>
  );
}
