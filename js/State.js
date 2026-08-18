/**
 * Global state management for OpportunityTracker
 */

export const state = {
  rawApplications: [],
  activeApplications: [],
  filteredApplications: [],
  selectedCompany: null,
  selectedJobTitle: null,
  selectedStatus: null,
  currentApp: null,
  dataVersion: 0,
  deleteRequests: {},
  dashboardRange: localStorage.getItem('dashboardRange') || 'yearly'
};
