import toast from 'react-hot-toast'

/**
 * Show an undo toast that delays a destructive action for 5 seconds.
 * If the user clicks "Undo", the action is cancelled.
 * If the toast expires, the action executes.
 */
export function undoToast({
  message,
  onConfirm,
  duration = 5000,
}: {
  message: string
  onConfirm: () => void
  duration?: number
}) {
  let undone = false

  const toastId = toast(
    (t) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span>{message}</span>
        <button
          onClick={() => {
            undone = true
            toast.dismiss(t.id)
            toast.success('Action undone', {
              duration: 2000,
              position: 'bottom-center',
              style: {
                background: '#10B981',
                color: '#fff',
                padding: '12px 16px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '500',
              },
            })
          }}
          style={{
            fontWeight: 600,
            textDecoration: 'underline',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            color: 'inherit',
            padding: 0,
            fontSize: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          Undo
        </button>
      </div>
    ),
    {
      duration,
      position: 'bottom-center',
      style: {
        background: '#1F2937',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: '500',
      },
    }
  )

  setTimeout(() => {
    if (!undone) {
      onConfirm()
    }
  }, duration)

  return toastId
}
