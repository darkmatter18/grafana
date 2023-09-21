import { set, get } from 'lodash';

import { CustomVariableModel } from '@grafana/data';
import * as grafanaRuntime from '@grafana/runtime';

import { Context, createContext } from '../__mocks__/datasource';
import createMockQuery from '../__mocks__/query';
import { createTemplateVariables } from '../__mocks__/utils';
import { multiVariable, singleVariable, subscriptionsVariable } from '../__mocks__/variables';
import { AzureQueryType } from '../types';


let getTempVars = () => [] as CustomVariableModel[];
let replace = () => "";

jest.mock('@grafana/runtime', () => {
  return {
    __esModule: true,
    ...jest.requireActual('@grafana/runtime')
  };
});

jest.spyOn(grafanaRuntime, 'getTemplateSrv').mockImplementation(() => ({
  replace: replace,
  getVariables: getTempVars,
  updateTimeRange: jest.fn(),
  containsTemplate: jest.fn()
}));

describe('AzureResourceGraphDatasource', () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = createContext({
      instanceSettings: {
        url: 'http://azureresourcegraphapi',
        jsonData: { subscriptionId: '9935389e-9122-4ef9-95f9-1513dd24753f', cloudName: 'azuremonitor' },
      },
    });
    getTempVars = () => [] as CustomVariableModel[];
    replace = () => "";
  });

  describe('When performing interpolateVariablesInQueries for azure_resource_graph', () => {
    it('should return a query unchanged if no template variables are provided', () => {
      const query = createMockQuery();
      query.queryType = AzureQueryType.AzureResourceGraph;
      replace = (target?: string | undefined) => {return target || ''}
      const templatedQuery = ctx.datasource.interpolateVariablesInQueries([query], {});
      expect(templatedQuery).toEqual(query);
    });

    it('should return a query with any template variables replaced', () => {
      const templateableProps = ['query'];
      const templateVariables = createTemplateVariables(templateableProps);
      getTempVars = () => Array.from(templateVariables.values()).map((item) => item.templateVariable as CustomVariableModel);
      replace = () => {return "query-template-variable"}
      const query = createMockQuery();
      const azureResourceGraph = {};
      for (const [path, templateVariable] of templateVariables.entries()) {
        set(azureResourceGraph, path, `$${templateVariable.variableName}`);
      }

      query.queryType = AzureQueryType.AzureResourceGraph;
      query.azureResourceGraph = {
        ...query.azureResourceGraph,
        ...azureResourceGraph,
      };
      const templatedQuery = ctx.datasource.interpolateVariablesInQueries([query], {});
      expect(templatedQuery).toHaveProperty('datasource');
      for (const [path, templateVariable] of templateVariables.entries()) {
        expect(get(templatedQuery, path)).toEqual(
          templateVariable.templateVariable.current.value
        );
      }
    });
  });

  describe('When applying template variables', () => {
    it('should expand single value template variable', () => {
      const target = createMockQuery({
        subscriptions: [],
        azureResourceGraph: {
          query: 'Resources | $var1',
          resultFormat: '',
        },
      });
      getTempVars = () => Array.from([subscriptionsVariable, singleVariable, multiVariable].values()).map((item) => item);
      replace = (target?: string | undefined) => {
        if (target === "Resources | $var1") {
          return "Resources | var1-foo"
        }
        return target || "";
      }
      expect(ctx.datasource.azureResourceGraphDatasource.applyTemplateVariables(target, {})).toEqual(
        expect.objectContaining({
          ...target,
          azureResourceGraph: { query: 'Resources | var1-foo', resultFormat: 'table' },
          queryType: 'Azure Resource Graph',
          subscriptions: [],
        })
      );
    });

    it('should expand multi value template variable', () => {
      const target = createMockQuery({
        subscriptions: [],
        azureResourceGraph: {
          query: 'resources | where $__contains(name, $var3)',
          resultFormat: '',
        },
      });
      getTempVars = () => Array.from([subscriptionsVariable, singleVariable, multiVariable].values()).map((item) => item);
      replace = (target?: string | undefined) => {
        if (target === "resources | where $__contains(name, $var3)") {
          return "resources | where $__contains(name, 'var3-foo','var3-baz')"
        }
        return target || "";
      }
      expect(ctx.datasource.azureResourceGraphDatasource.applyTemplateVariables(target, {})).toEqual(
        expect.objectContaining({
          ...target,
          azureResourceGraph: {
            query: `resources | where $__contains(name, 'var3-foo','var3-baz')`,
            resultFormat: 'table',
          },
          queryType: 'Azure Resource Graph',
          subscriptions: [],
        })
      );
    });
  });

  it('should apply subscription variable', () => {
    const target = createMockQuery({
      subscriptions: ['$subs'],
      azureResourceGraph: {
        query: 'resources | where $__contains(name)',
        resultFormat: '',
      },
    });
    getTempVars = () => Array.from([subscriptionsVariable, singleVariable, multiVariable].values()).map((item) => item);
      replace = (target?: string | undefined) => {
        if (target === "$subs") {
          return "sub-foo,sub-baz"
        }
        return target || "";
      }
    expect(ctx.datasource.azureResourceGraphDatasource.applyTemplateVariables(target, {})).toEqual(
      expect.objectContaining({
        azureResourceGraph: {
          query: `resources | where $__contains(name)`,
          resultFormat: 'table',
        },
        queryType: 'Azure Resource Graph',
        subscriptions: ['sub-foo', 'sub-baz'],
      })
    );
  });
});
