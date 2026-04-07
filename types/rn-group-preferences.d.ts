declare module 'rn-group-preferences' {
  type GroupPreferenceOptions = Record<string, unknown>;

  const SharedGroupPreferences: {
    getItem(
      key: string,
      appGroup: string,
      options?: GroupPreferenceOptions
    ): Promise<unknown>;
    setItem(
      key: string,
      value: unknown,
      appGroup: string,
      options?: GroupPreferenceOptions
    ): Promise<void>;
  };

  export default SharedGroupPreferences;
}
