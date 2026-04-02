'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

interface ReportModalProps {
  postId?: string;
  replyId?: string;
  onClose: () => void;
}

const REPORT_REASONS = [
  '垃圾訊息 / 廣告',
  '騷擾或仇恨言論',
  '不當內容',
  '違反版規',
  '其他',
];

export function ReportModal({ postId, replyId, onClose }: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const reason = selectedReason === '其他' ? customReason.trim() : selectedReason;
    if (!reason) return;

    setIsSubmitting(true);
    setError('');
    try {
      await apiFetch('/posts/reports', {
        method: 'POST',
        body: JSON.stringify({ postId, replyId, reason }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '檢舉失敗，請稍後再試');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-xl leading-none"
        >
          &times;
        </button>

        {success ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">&#10003;</div>
            <h3 className="text-lg font-semibold mb-2">已送出檢舉</h3>
            <p className="text-gray-500 text-sm mb-4">感謝您的回報，管理員將會盡快處理。</p>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              關閉
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-semibold mb-4">檢舉{postId ? '文章' : '回覆'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="space-y-2 mb-4">
                {REPORT_REASONS.map((reason) => (
                  <label key={reason} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="reason"
                      value={reason}
                      checked={selectedReason === reason}
                      onChange={() => setSelectedReason(reason)}
                      className="text-blue-600"
                    />
                    <span className="text-sm">{reason}</span>
                  </label>
                ))}
              </div>

              {selectedReason === '其他' && (
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  rows={3}
                  required
                  placeholder="請描述檢舉原因..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none mb-4 text-sm"
                />
              )}

              {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!selectedReason || (selectedReason === '其他' && !customReason.trim()) || isSubmitting}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? '送出中...' : '送出檢舉'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
