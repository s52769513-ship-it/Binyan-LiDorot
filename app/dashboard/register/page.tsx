'use client'

import RegisterStudentForm from '@/components/RegisterStudentForm'

// הטופס עצמו חי ב-components/RegisterStudentForm כדי שגם החלון בלשונית
// "נרשמים" ישתמש בדיוק באותו טופס, בלי כפילות.
export default function RegisterPage() {
  return <RegisterStudentForm />
}
