import { Toaster } from '../components/ui/Toaster';
import { Sidebar } from '../components/kora/Sidebar';
import { Footer } from './kora/Footer';

export const metadata = {
  title: 'Rubitt Companion',
  description: 'Your AI-powered study partner.',
};

export default function AdminDashboardlayout({
  children,
}) {


  return (
    <div className="h-full flex flex-col">
      <div className="font-body antialiased flex-1 flex bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col relative">
          <main className="flex-1 overflow-y-auto">{children}</main>
          {/* <AiAssistant /> */}
        </div>
        <Toaster />
      </div>
      <Footer />
    </div>
  );
}

