import { useState } from 'react'
import {
  ArrowsLeftRight,
  Buildings,
  CalendarBlank,
  CalendarDots,
  Hash,
  Link,
  Gear as SettingsIcon,
  ShieldCheck,
  Users,
} from '@phosphor-icons/react'
import { PageHeader } from '@/components/ui'
import { useCan } from '@/hooks/useCan'
import SchoolProfileTab from './SchoolProfileTab'
import UsersTab from './UsersTab'
import PermissionsTab from './PermissionsTab'
import AcademicTab from './AcademicTab'
import RatesTab from './RatesTab'
import FiscalPeriodsTab from './FiscalPeriodsTab'
import MappingsTab from './MappingsTab'
import SequencesTab from './SequencesTab'

const ALL_TABS = [
  { key: 'profile', label: 'School Profile', icon: Buildings, component: SchoolProfileTab, adminOnly: false },
  { key: 'users', label: 'Users', icon: Users, component: UsersTab, adminOnly: true },
  { key: 'permissions', label: 'Permissions', icon: ShieldCheck, component: PermissionsTab, adminOnly: true },
  { key: 'academic', label: 'Academic Years & Terms', icon: CalendarBlank, component: AcademicTab, adminOnly: false },
  { key: 'rates', label: 'Currencies & Rates', icon: ArrowsLeftRight, component: RatesTab, adminOnly: false },
  { key: 'periods', label: 'Fiscal Periods', icon: CalendarDots, component: FiscalPeriodsTab, adminOnly: false },
  { key: 'mappings', label: 'Account Mappings', icon: Link, component: MappingsTab, adminOnly: false },
  { key: 'sequences', label: 'Sequences', icon: Hash, component: SequencesTab, adminOnly: false },
] as const

type TabKey = (typeof ALL_TABS)[number]['key']

export default function Settings() {
  // Users & Permissions administration is gated on the `users` module.
  const canManageUsers = useCan('users', 'edit')
  const TABS = ALL_TABS.filter((t) => !t.adminOnly || canManageUsers)

  const [active, setActive] = useState<TabKey>('profile')
  const activeTab = TABS.find((t) => t.key === active) ?? TABS[0]
  const ActiveComponent = activeTab.component

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="School profile, users, calendars, currencies and posting configuration"
        icon={SettingsIcon}
      />

      <div className="flex gap-2 flex-wrap border-b border-gray-200 dark:border-gray-700 pb-px">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = tab.key === active
          return (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-t-lg border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-primary-600 text-primary-700 dark:text-primary-300 font-medium bg-primary-50/60 dark:bg-primary-900/20'
                  : 'border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <ActiveComponent />
    </div>
  )
}
