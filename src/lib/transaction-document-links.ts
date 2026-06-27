import type { SupabaseClient } from '@supabase/supabase-js';

export async function deleteTransactionWithDocumentCleanup(args: {
  supabase: SupabaseClient;
  transactionId: string;
  userId?: string | null;
}) {
  const transactionId = args.transactionId.trim();
  if (!transactionId) {
    throw new Error('Transaction id is required.');
  }

  const rpcArgs: {
    p_transaction_id: string;
    p_user_id?: string;
  } = {
    p_transaction_id: transactionId,
  };

  const userId = args.userId?.trim();
  if (userId) {
    rpcArgs.p_user_id = userId;
  }

  const { error } = await args.supabase.rpc('rpc_delete_transaction_and_cleanup_receipt_links', rpcArgs);
  if (error) {
    throw error;
  }
}
