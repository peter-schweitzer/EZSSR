import { data, err } from '@peter-schweitzer/ez-utils';
import { readFileSync, readdirSync } from 'node:fs';
import { Component } from './Component.js';

export class SSR {
  /**@type {LUT<Component>} */
  #components = {};

  /**
   * @param {string?} [componentDirPath="./components"] relative path to the directory containing the component HTML-files (won't parse components when set to null)
   * @throws
   */
  constructor(componentDirPath = './components') {
    if (componentDirPath !== null)
      for (const f of readdirSync(componentDirPath, 'utf8'))
        if (f.endsWith('.html')) this.#components[f.slice(0, -5)] = new Component(this.#components, readFileSync(`${componentDirPath}/${f}`, 'utf8'));
  }

  /**
   * @param {string} name
   * @param {LUT<any>} props
   * @returns {ErrorOr<string>}
   */
  renderComponent(name, props) {
    if (!Object.hasOwn(this.#components, name)) return err(`component "${name}" is unknown (was not parsed on instantiation)`);
    return this.#components[name].render(props);
  }

  /**
   * @param {string} main relative path to the main HTML-file of the site that should be rendered
   * @param {LUT<any>} props Object with all the needed props to render the site
   * @returns {ErrorOr<string>}
   */
  renderFile(main, props) {
    /**@type {string}*/
    let main_string;
    try {
      main_string = readFileSync(main, { encoding: 'utf8' });
    } catch (e) {
      return err(`error while reading main file (${typeof e === 'string' ? e : JSON.stringify(e)})`);
    }

    for (const prop in props) main_string = main_string.replace(new RegExp(`\\\${ ?${prop}(?: ?: ?(?:string|number|boolean|object|any))? ?}`, 'g'), props[prop]);

    const rendered_page = [];
    const span = { start: 0, end: 0 };

    while ((span.start = main_string.indexOf('<ez', span.end)) !== -1) {
      if (span.end < span.start - 1) rendered_page.push(main_string.slice(span.end, span.start));

      span.end = main_string.indexOf('/>', span.start) + 2;
      const nested_string = main_string.slice(span.start, span.end);

      const name = nested_string.match(/ name="(?<name>[\w_]+)"/).groups.name;
      if (name === undefined) return err("invalid component, missing 'name' attribute");

      const id = nested_string.match(/ id="(?<id>[\w_]+)"/).groups.id;
      if (id === undefined) return err("invalid component, missing 'id' attribute");

      if (!Object.hasOwn(props, id)) return err(`prop "${id}" is missing`);
      const nested_props = props[id];

      if (nested_string.startsWith('<ez-for ')) {
        if (!Array.isArray(nested_props)) return err('ez-for components need an array of props to be rendered');
        for (const [i, for_props] of nested_props.entries()) {
          if (!Object.hasOwn(for_props, 'i')) for_props.i = i;
          const { err: nested_render_err, data: rendered_component } = this.renderComponent(name, for_props);
          if (nested_render_err !== null) return err(nested_render_err);
          rendered_page.push(rendered_component);
        }
      } else {
        const { err: nested_render_err, data: rendered_component } = this.renderComponent(name, nested_props);
        if (nested_render_err !== null) return err(nested_render_err);
        rendered_page.push(rendered_component);
      }
    }
    rendered_page.push(main_string.slice(span.end));

    return data(rendered_page.join(''));
  }
}
