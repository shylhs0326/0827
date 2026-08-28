'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { approveImport, rollbackBatch, stageImport, validateBatch } from '@/lib/import/repository';

export async function stageImportAction(formData: FormData) {
  await requireAdmin();
  const result = await stageImport(formData);
  revalidatePath('/admin/data-management');
  return result;
}

export async function validateImportAction(formData: FormData) {
  await requireAdmin();
  const batchId = readRequiredString(formData, 'batchId');
  const result = await validateBatch(batchId, formData.get('mapping'));
  revalidatePath('/admin/data-management');
  return result;
}

export async function approveImportAction(formData: FormData) {
  await requireAdmin();
  const result = await approveImport(readRequiredString(formData, 'batchId'), readOptionalString(formData, 'replaceConfirmation'));
  revalidatePath('/admin/data-management');
  return result;
}

export async function rollbackImportAction(formData: FormData) {
  await requireAdmin();
  const result = await rollbackBatch(readRequiredString(formData, 'batchId'));
  revalidatePath('/admin/data-management');
  return result;
}

function readRequiredString(formData: FormData, field: string): string {
  const value = formData.get(field);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}_REQUIRED`);
  return value;
}

function readOptionalString(formData: FormData, field: string): string | undefined {
  const value = formData.get(field);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
