import { redirect } from 'next/navigation';

export default function AdminHome() {
  redirect(`${process.env['WEB_ORIGIN'] ?? 'http://localhost:3000'}/admin`);
}
