'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import StandardDossier from '@/components/StandardDossier';

export default function StandardPathPage() {
  const params = useParams();
  const paramVal = params?.is_number;
  const raw = Array.isArray(paramVal) ? paramVal.join('/') : paramVal || '';
  let isNumber = '';
  try {
    isNumber = decodeURIComponent(raw).trim();
  } catch {
    isNumber = raw.trim();
  }
  return <StandardDossier isNumber={isNumber} />;
}
