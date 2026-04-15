import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, Circle, CreditCard, BookOpen, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

interface TutorOnboardingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isStripeConnected: boolean;
  hasSubjects: boolean;
}

export default function TutorOnboarding({
  open,
  onOpenChange,
  isStripeConnected,
  hasSubjects,
}: TutorOnboardingProps) {
  const { t } = useTranslation();
  const completedSteps = [isStripeConnected, hasSubjects].filter(Boolean).length;
  const totalSteps = 2;
  const isComplete = completedSteps === totalSteps;

  const steps = [
    {
      id: 1,
      title: t('onboarding.paymentSetup'),
      description: t('onboarding.paymentSetupDesc'),
      completed: isStripeConnected,
      link: '/finance',
      icon: CreditCard,
    },
    {
      id: 2,
      title: t('onboarding.subjectsAndPricing'),
      description: t('onboarding.subjectsAndPricingDesc'),
      completed: hasSubjects,
      link: '/lesson-settings',
      icon: BookOpen,
    },
  ];

  const progressPercent = (completedSteps / totalSteps) * 100;

  return (
    <Dialog open={open && !isComplete} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto text-center p-8 rounded-3xl" hideClose>
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-indigo-600" />
        </div>
        <DialogTitle className="text-2xl font-black text-gray-900 mb-2">
          {t('onboarding.welcome')}
        </DialogTitle>
        <p className="text-gray-500 mb-6 text-sm">
          {t('onboarding.completeSteps')}
        </p>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">{t('onboarding.progress')}</span>
            <span className="text-sm font-bold text-indigo-600">
              {completedSteps}/{totalSteps}
            </span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Link
                key={step.id}
                to={step.link}
                onClick={() => {
                  if (!step.completed) {
                    onOpenChange(false);
                  }
                }}
                className={cn(
                  'flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all group',
                  step.completed
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm'
                )}
              >
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                    step.completed ? 'bg-green-500' : 'bg-indigo-100 group-hover:bg-indigo-200'
                  )}
                >
                  {step.completed ? (
                    <CheckCircle className="w-5 h-5 text-white" />
                  ) : (
                    <Icon
                      className={cn(
                        'w-5 h-5',
                        step.completed ? 'text-white' : 'text-indigo-600'
                      )}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      className={cn(
                        'text-sm font-semibold',
                        step.completed ? 'text-green-800' : 'text-gray-900'
                      )}
                    >
                      {step.title}
                    </h3>
                    {step.completed && (
                      <span className="text-xs font-medium text-green-600">✓</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                </div>
                {!step.completed && (
                  <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-2 group-hover:text-indigo-600 transition-colors" />
                )}
              </Link>
            );
          })}
        </div>

        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          className="w-full rounded-xl text-sm"
        >
          {t('onboarding.close')}
        </Button>
        <p className="text-xs text-gray-400 mt-2">
          {t('onboarding.showsUntilComplete')}
        </p>
      </DialogContent>
    </Dialog>
  );
}
