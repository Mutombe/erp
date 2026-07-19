import toast from 'react-hot-toast'

// User-friendly error message mappings
const errorMessages: Record<string, string> = {
  'Network Error': 'Request failed — please check your connection and try again.',
  'Request failed with status code 500': 'Something went wrong on our end. Please try again later.',
  'Request failed with status code 503': 'Service temporarily unavailable. Please try again in a moment.',
  'Request failed with status code 401': 'Your session has expired. Please log in again.',
  'Request failed with status code 403': "You don't have permission to perform this action.",
  'Request failed with status code 404': 'The requested resource was not found.',
  'Request failed with status code 400': 'Invalid request. Please check your input.',
  'Request failed with status code 409': 'This item already exists or conflicts with existing data.',
  'Request failed with status code 429': 'Too many requests. Please slow down and try again.',
}

// Parse API error response into user-friendly message
export function parseApiError(error: unknown, fallbackMessage: string = 'An error occurred'): string {
  if (!error) return fallbackMessage

  // Handle axios error structure
  const axiosError = error as {
    response?: {
      data?: {
        detail?: string
        message?: string
        error?: string
        errors?: Record<string, string[]>
        [key: string]: unknown
      }
      status?: number
    }
    message?: string
  }

  // Check for response data
  if (axiosError.response?.data) {
    const data = axiosError.response.data

    // Direct detail message
    if (typeof data.detail === 'string') {
      return formatErrorMessage(data.detail)
    }

    // Direct message
    if (typeof data.message === 'string') {
      return formatErrorMessage(data.message)
    }

    // Direct error
    if (typeof data.error === 'string') {
      return formatErrorMessage(data.error)
    }

    // DRF validation errors (field: [errors])
    if (data.errors && typeof data.errors === 'object') {
      return formatValidationErrors(data.errors)
    }

    // Check for field-level errors (common DRF pattern)
    const fieldErrors = Object.entries(data).filter(
      ([key, value]) =>
        key !== 'detail' &&
        key !== 'message' &&
        key !== 'error' &&
        (Array.isArray(value) || typeof value === 'string')
    )

    if (fieldErrors.length > 0) {
      const errors: Record<string, string[]> = {}
      fieldErrors.forEach(([key, value]) => {
        errors[key] = Array.isArray(value) ? value : [value as string]
      })
      return formatValidationErrors(errors)
    }
  }

  // Check error message against known patterns
  const message = axiosError.message || ''
  if (errorMessages[message]) {
    return errorMessages[message]
  }

  return fallbackMessage
}

// Format validation errors into a readable message
function formatValidationErrors(errors: Record<string, string[]>): string {
  const messages: string[] = []

  for (const [field, fieldErrors] of Object.entries(errors)) {
    const readableField = field.replace(/_/g, ' ')
    const errorList = fieldErrors.filter(Boolean)

    if (errorList.length > 0) {
      // Make the first error message more readable
      const firstError = errorList[0]

      // Check if it's a generic "This field" error and replace with field name
      if (firstError.toLowerCase().startsWith('this field')) {
        messages.push(`${capitalizeFirst(readableField)} ${firstError.substring(11)}`)
      } else if (firstError.toLowerCase().includes('this value')) {
        messages.push(firstError.replace(/this value/gi, readableField))
      } else {
        messages.push(`${capitalizeFirst(readableField)}: ${firstError}`)
      }
    }
  }

  if (messages.length === 1) {
    return messages[0]
  }

  if (messages.length > 1) {
    return messages.slice(0, 2).join('. ') + (messages.length > 2 ? ` (+${messages.length - 2} more)` : '')
  }

  return 'Please check your input and try again.'
}

// Format a single error message
function formatErrorMessage(message: string): string {
  // Remove technical prefixes
  const formatted = message
    .replace(/^Error:\s*/i, '')
    .replace(/^ValidationError:\s*/i, '')
    .trim()

  // Capitalize first letter
  return capitalizeFirst(formatted)
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// Toast wrapper with consistent styling
export const showToast = {
  success: (message: string) => {
    toast.success(message, {
      duration: 3000,
      position: 'top-right',
      style: {
        background: '#10B981',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: '500',
      },
      iconTheme: {
        primary: '#fff',
        secondary: '#10B981',
      },
    })
  },

  error: (message: string) => {
    toast.error(message, {
      duration: 5000,
      position: 'top-right',
      style: {
        background: '#EF4444',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: '500',
      },
      iconTheme: {
        primary: '#fff',
        secondary: '#EF4444',
      },
    })
  },

  info: (message: string) => {
    toast(message, {
      duration: 3000,
      position: 'top-right',
      style: {
        background: '#3B82F6',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: '500',
      },
      icon: 'ℹ️',
    })
  },

  warning: (message: string) => {
    toast(message, {
      duration: 4000,
      position: 'top-right',
      style: {
        background: '#F59E0B',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: '500',
      },
      icon: '⚠️',
    })
  },

  loading: (message: string) => {
    return toast.loading(message, {
      position: 'top-right',
      style: {
        background: '#1F2937',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: '500',
      },
    })
  },

  dismiss: (toastId?: string) => {
    if (toastId) {
      toast.dismiss(toastId)
    } else {
      toast.dismiss()
    }
  },

  // Promise helper for async operations
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((err: unknown) => string)
    }
  ) => {
    return toast.promise(
      promise,
      {
        loading: messages.loading,
        success: messages.success,
        error: (err) => {
          if (typeof messages.error === 'function') {
            return messages.error(err)
          }
          return parseApiError(err, messages.error)
        },
      },
      {
        position: 'top-right',
        style: {
          padding: '12px 16px',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: '500',
        },
      }
    )
  },
}

export default showToast
