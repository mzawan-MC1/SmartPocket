export function getFieldInputClassName(baseClassName: string, hasError?: boolean) {
  return `${baseClassName}${hasError ? ' input-error' : ''}`;
}

export function getFieldLabelClassName(hasError?: boolean, baseClassName = 'mb-1.5 block text-[13px] font-700 leading-4') {
  return `${baseClassName} ${hasError ? 'field-label-error' : 'text-foreground'}`;
}

export function getFieldErrorTextClassName(baseClassName = 'mt-1 text-xs font-600 leading-4') {
  return `${baseClassName} field-error-text`;
}

export function getRequiredMarkerClassName(baseClassName = 'field-required-marker') {
  return baseClassName;
}
