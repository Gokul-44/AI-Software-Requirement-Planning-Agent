import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, GoldenDemoButton } from '../components/ui';
import { buttonClass } from '../lib/buttonClass';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="mx-auto max-w-xl py-10">
      <EmptyState
        title="404: this page does not exist"
        icon={<Compass className="h-6 w-6" aria-hidden="true" />}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/" className={buttonClass('primary', 'md')}>
              Back to the home page
            </Link>
            <GoldenDemoButton />
          </div>
        }
      >
        The link may be out of date or mistyped. Start a new plan from the home page, or open a
        sample plan.
      </EmptyState>
    </div>
  );
}
