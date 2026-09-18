import pb from '@/lib/pocketbase/client'
import type { Role, UserRecord } from '@/types/domain'

export const usersService = {
  list: () => pb.collection<UserRecord>('users').getFullList({ sort: 'name' }),
  update: (id: string, data: FormData | Partial<UserRecord> | Record<string, unknown>) =>
    pb.collection<UserRecord>('users').update(id, data),
  create: (data: { name: string; email: string; password: string; role: Role }) =>
    pb
      .collection<UserRecord>('users')
      .create({ ...data, passwordConfirm: data.password, active: true, verified: true }),
  requestEmailChange: (email: string) => pb.collection('users').requestEmailChange(email),
  confirmEmailChange: (token: string, password: string) =>
    pb.collection('users').confirmEmailChange(token, password),
  requestPasswordReset: (email: string) => pb.collection('users').requestPasswordReset(email),
  confirmPasswordReset: (token: string, password: string) =>
    pb.collection('users').confirmPasswordReset(token, password, password),
  confirmVerification: (token: string) => pb.collection('users').confirmVerification(token),
}
