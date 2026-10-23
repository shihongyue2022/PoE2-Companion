import { useState } from 'react';
import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PresetNumberInput from './PresetNumberInput';
it('selects a zero budget without treating it as automatic and keeps exact editing folded', async () => {
  function Harness() {
    const [value, setValue] = useState('');
    return <PresetNumberInput label="预算" value={value} onChange={setValue} automaticLabel="不限" presets={[{ value: '0', label: '0' }, { value: '100', label: '100' }]} />;
  }
  render(<Harness />); const user = userEvent.setup();
  expect(screen.getByLabelText('预算').closest('details')!.open).toBe(false);
  await user.selectOptions(screen.getByLabelText('预算档位'), '0');
  expect(screen.getByLabelText('预算')).toHaveValue(0);
  await user.selectOptions(screen.getByLabelText('预算档位'), 'custom');
  expect(screen.getByLabelText('预算').closest('details')!.open).toBe(true);
  await user.clear(screen.getByLabelText('预算')); await user.type(screen.getByLabelText('预算'), '123');
  expect(screen.getByLabelText('预算')).toHaveValue(123);
  await user.selectOptions(screen.getByLabelText('预算档位'), '');
  expect(screen.getByLabelText('预算')).toHaveValue(null);
  expect(screen.getByLabelText('预算').closest('details')!.open).toBe(false);
});
