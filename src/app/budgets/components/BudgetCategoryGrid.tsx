'use client';
import React, { useState } from 'react';
import {
  Home,
  Utensils,
  Car,
  Zap,
  ShoppingBag,
  Heart,
  Gamepad2,
  Plane,
  Plus,
  Edit2,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';

import { toast } from 'sonner';
import AddBudgetForm from './AddBudgetForm';
import Icon from '@/components/ui/AppIcon';


// Backend integration point: fetch from /api/budgets?month=YYYY-MM&userId=current
const budgets = [
  { id: 'bud-001', category: 'Housing', icon: Home, allocated: 1500, spent: 1450, color: '#7c3aed', iconBg: 'bg-purple-100 text-purple-700' },
  { id: 'bud-002', category: 'Food & Dining', icon: Utensils, allocated: 800, spent: 828.75, color: '#f97316', iconBg: 'bg-orange-100 text-orange-700' },
  { id: 'bud-003', category: 'Transport', icon: Car, allocated: 400, spent: 248.50, color: '#2563eb', iconBg: 'bg-blue-100 text-blue-700' },
  { id: 'bud-004', category: 'Utilities', icon: Zap, allocated: 200, spent: 189.99, color: '#8b5cf6', iconBg: 'bg-violet-100 text-violet-700' },
  { id: 'bud-005', category: 'Shopping', icon: ShoppingBag, allocated: 300, spent: 374.20, color: '#d97706', iconBg: 'bg-amber-100 text-amber-700' },
  { id: 'bud-006', category: 'Healthcare', icon: Heart, allocated: 150, spent: 34.80, color: '#ec4899', iconBg: 'bg-pink-100 text-pink-700' },
  { id: 'bud-007', category: 'Entertainment', icon: Gamepad2, allocated: 200, spent: 234.98, color: '#dc2626', iconBg: 'bg-red-100 text-red-700' },
  { id: 'bud-008', category: 'Travel', icon: Plane, allocated: 450, spent: 0, color: '#0ea5a0', iconBg: 'bg-teal-100 text-teal-700' },
];

function getBarClass(pct: number) {
  if (pct >= 100) return 'budget-bar-red';
  if (pct >= 80) return 'budget-bar-amber';
  return 'budget-bar-green';
}

function getStatus(pct: number): { label: string; variant: 'exceeded' | 'warning' | 'active' | 'default' } {
  if (pct >= 100) return { label: 'Exceeded', variant: 'exceeded' };
  if (pct >= 80) return { label: 'Near Limit', variant: 'warning' };
  if (pct === 0) return { label: 'Not Started', variant: 'default' };
  return { label: 'On Track', variant: 'active' };
}

export default function BudgetCategoryGrid() {
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-700 text-foreground">Category Budgets</h2>
        <button onClick={() => setShowAddModal(true)} className="btn-ghost text-sm text-accent">
          <Plus size={14} />
          Add Category Budget
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
        {budgets.map((bud) => {
          const Icon = bud.icon;
          const pct = bud.allocated > 0 ? (bud.spent / bud.allocated) * 100 : 0;
          const remaining = bud.allocated - bud.spent;
          const status = getStatus(pct);
          const barClass = getBarClass(pct);

          return (
            <div
              key={bud.id}
              className={`card-elevated p-5 hover:shadow-card-md transition-shadow duration-200 ${
                pct >= 100 ? 'border-negative/30 bg-negative-soft/10' :
                pct >= 80 ? 'border-warning/30' : ''
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl ${bud.iconBg} flex items-center justify-center`}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-700 text-foreground">{bud.category}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {pct >= 100 && <AlertCircle size={11} className="text-negative" />}
                      {pct >= 80 && pct < 100 && <AlertTriangle size={11} className="text-warning" />}
                      <span className={`text-[10px] font-600 ${
                        status.variant === 'exceeded' ? 'text-negative' :
                        status.variant === 'warning' ? 'text-warning' :
                        status.variant === 'active'? 'text-positive' : 'text-muted-foreground'
                      }`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title={`Edit ${bud.category} budget`}
                  onClick={() => toast.info(`Editing ${bud.category} budget`)}
                >
                  <Edit2 size={13} />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">
                    ${bud.spent.toLocaleString('en-US', { minimumFractionDigits: 2 })} spent
                  </span>
                  <span className="text-xs font-600 font-tabular text-muted-foreground">
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barClass}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>

              {/* Amounts */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">Allocated</p>
                  <p className="text-sm font-700 font-tabular text-foreground">
                    ${bud.allocated.toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">
                    {remaining >= 0 ? 'Remaining' : 'Over by'}
                  </p>
                  <p className={`text-sm font-700 font-tabular ${remaining >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {remaining < 0 ? '-' : ''}${Math.abs(remaining).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add Budget Card */}
        <button
          onClick={() => setShowAddModal(true)}
          className="card-elevated border-dashed border-2 border-border hover:border-accent hover:bg-accent/5 transition-all duration-200 flex flex-col items-center justify-center gap-2 p-8 min-h-[180px] group"
        >
          <div className="w-10 h-10 rounded-full bg-muted group-hover:bg-accent/10 flex items-center justify-center transition-colors">
            <Plus size={20} className="text-muted-foreground group-hover:text-accent transition-colors" />
          </div>
          <p className="text-sm font-600 text-muted-foreground group-hover:text-accent transition-colors">
            Add Category Budget
          </p>
        </button>
      </div>

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Set Category Budget"
        description="Allocate a monthly spending limit for a category"
        size="md"
      >
        <AddBudgetForm
          onSuccess={() => { setShowAddModal(false); toast.success('Budget set successfully'); }}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>
    </div>
  );
}