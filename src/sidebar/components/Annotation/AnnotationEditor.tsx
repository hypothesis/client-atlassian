import { useEffect, useCallback, useRef, useState } from 'preact/hooks';

import type { Annotation } from '../../../types/api';
import type { SidebarSettings } from '../../../types/config';
import {
  annotationRole,
  isReply,
  isSaved,
} from '../../helpers/annotation-metadata';
import { applyTheme } from '../../helpers/theme';
import { withServices } from '../../service-context';
import type { AnnotationsService } from '../../services/annotations';
import type { APIService } from '../../services/api';
import type { TagsService } from '../../services/tags';
import type { ToastMessengerService } from '../../services/toast-messenger';
import { useSidebarStore } from '../../store';
import type { Draft } from '../../store/modules/drafts';
import AutocompleteList from '../AutocompleteList';
import MarkdownEditor from '../MarkdownEditor';
import TagEditor from '../TagEditor';
import AnnotationLicense from './AnnotationLicense';
import AnnotationPublishControl from './AnnotationPublishControl';

type AnnotationEditorProps = {
  /** The annotation under edit */
  annotation: Annotation;
  /** The annotation's draft */
  draft: Draft;

  // Injected
  api: APIService;
  annotationsService: AnnotationsService;
  settings: SidebarSettings;
  toastMessenger: ToastMessengerService;
  tags: TagsService;
};

/**
 * Display annotation content in an editable format.
 */
function AnnotationEditor({
  annotation,
  draft,
  api,
  annotationsService,
  settings,
  tags: tagsService,
  toastMessenger,
}: AnnotationEditorProps) {
  const inputEl = useRef<HTMLTextAreaElement>();
  // Track the currently-entered text in the tag editor's input
  const [pendingTag, setPendingTag] = useState<string | null>(null);
  const [userListOpen, setUserListOpen] = useState(false);

  const store = useSidebarStore();
  const group = store.getGroup(annotation.group);
  const userId = annotation.user;

  const [userList, setUserList] = useState([]);

  useEffect(() => {
    const fetchUsers = async (userId, group) => {
      const users = await api.mentions.users.read({
        userid: userId,
        groupid: group.groupid,
      });
      setUserList(users.map(user => user.name));
    };

    fetchUsers(userId, group).catch(console.error);
  }, [group]);

  const pendingUser = () => {
    const match = draft.text.match(/\B\@([\w\-]+)?$/);
    return match ? match[1] : null;
  };
  const hasPendingMention = (text: string) => !!text.match(/\B\@([\w\-]+)?$/);

  const shouldShowLicense =
    !draft.isPrivate && group && group.type !== 'private';

  const tags = draft.tags;
  const text = draft.text;
  const isEmpty = !text && !tags.length;

  const onEditTags = useCallback(
    (tags: string[]) => {
      store.createDraft(draft.annotation, { ...draft, tags });
    },
    [draft, store]
  );

  const onAddTag = useCallback(
    /**
     * Verify `newTag` has content and is not a duplicate; add the tag
     *
     * @return `true` if tag was added to the draft; `false` if duplicate or
     * empty
     */
    (newTag: string) => {
      if (!newTag || tags.indexOf(newTag) >= 0) {
        // don't add empty or duplicate tags
        return false;
      }
      const tagList = [...tags, newTag];
      // Update the tag locally for the suggested-tag list
      tagsService.store(tagList);
      onEditTags(tagList);
      return true;
    },
    [onEditTags, tags, tagsService]
  );

  const onRemoveTag = useCallback(
    /**
     * Remove tag from draft if present.
     *
     * @return `true` if tag removed from draft, `false` if tag not found in
     * draft tags
     */
    (tag: string) => {
      const newTagList = [...tags]; // make a copy
      const index = newTagList.indexOf(tag);
      if (index >= 0) {
        newTagList.splice(index, 1);
        onEditTags(newTagList);
        return true;
      }
      return false;
    },
    [onEditTags, tags]
  );

  const onEditText = useCallback(
    (text: string) => {
      store.createDraft(draft.annotation, { ...draft, text });
      setUserListOpen(hasPendingMention(text));
    },
    [draft, store]
  );

  const handleUserSelect = (user: string) => {
    const textWithMention = draft.text.replace(/\B\@([\w\-]+)?$/, `@${user} `);
    onEditText(textWithMention);
    inputEl.current!.focus();
  };

  const onSetPrivate = useCallback(
    (isPrivate: boolean) => {
      store.createDraft(annotation, {
        ...draft,
        isPrivate,
      });
      // Persist this as privacy default for future annotations unless this is a reply
      if (!isReply(annotation)) {
        store.setDefault('annotationPrivacy', isPrivate ? 'private' : 'shared');
      }
    },
    [annotation, draft, store]
  );

  const onSave = async () => {
    // If there is any content in the tag editor input field that has
    // not been committed as a tag, go ahead and add it as a tag
    // See https://github.com/hypothesis/product-backlog/issues/1122
    if (pendingTag) {
      onAddTag(pendingTag);
    }
    const successMessage = `${annotationRole(annotation)} ${
      isSaved(annotation) ? 'updated' : 'saved'
    }`;
    try {
      await annotationsService.save(annotation);
      toastMessenger.success(successMessage, { visuallyHidden: true });
    } catch (err) {
      toastMessenger.error('Saving annotation failed');
    }
  };

  // Revert changes to this annotation
  const onCancel = useCallback(() => {
    store.removeDraft(annotation);
    if (!isSaved(annotation)) {
      store.removeAnnotations([annotation]);
    }
  }, [annotation, store]);

  // Allow saving of annotation by pressing CMD/CTRL-Enter
  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key;
    if (isEmpty) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key === 'Enter') {
      event.stopPropagation();
      event.preventDefault();
      onSave();
    }
  };

  const textStyle = applyTheme(['annotationFontFamily'], settings);

  const formatSuggestedUser = (user: string) => {
    // If the current input doesn't have a mention,just render the user as-is.
    if (!hasPendingMention(draft.text) || !pendingUser()) {
      return <span>@{user}</span>;
    }

    // filtering of users is case-insensitive
    const curVal = pendingUser().toLowerCase();

    const suggestedUser = user.toLowerCase();
    const matchIndex = suggestedUser.indexOf(curVal);

    // If the current input doesn't seem to match the suggested user,
    // just render the user as-is.
    if (matchIndex === -1) {
      return <span>@{user}</span>;
    }

    // Break the suggested user into three parts:
    // 1. Substring of the suggested user that occurs before the match
    //    with the current input
    const prefix = user.slice(0, matchIndex);
    // 2. Substring of the suggested user that matches the input text. NB:
    //    This may be in a different case than the input text.
    const matchString = user.slice(matchIndex, matchIndex + curVal.length);
    // 3. Substring of the suggested user that occurs after the matched input
    const suffix = user.slice(matchIndex + curVal.length);

    return (
      <span>
        @<strong>{prefix}</strong>
        {matchString}
        <strong>{suffix}</strong>
      </span>
    );
  };

  return (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions */
    <div
      data-testid="annotation-editor"
      className="space-y-4"
      onKeyDown={onKeyDown}
    >
      <MarkdownEditor
        textStyle={textStyle}
        label="Annotation body"
        text={text}
        onEditText={onEditText}
      />
      <AutocompleteList
        id={`${1}-AutocompleteList`}
        list={userList}
        listFormatter={formatSuggestedUser}
        open={userListOpen}
        onSelectItem={handleUserSelect}
        itemPrefixId={`${1}-AutocompleteList-item-`}
        activeItem={''}
      />
      <TagEditor
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
        onTagInput={setPendingTag}
        tagList={tags}
      />
      {group && (
        <AnnotationPublishControl
          group={group}
          isDisabled={isEmpty}
          isPrivate={draft.isPrivate}
          onCancel={onCancel}
          onSave={onSave}
          onSetPrivate={onSetPrivate}
        />
      )}
      {shouldShowLicense && <AnnotationLicense />}
    </div>
  );
}

export default withServices(AnnotationEditor, [
  'api',
  'annotationsService',
  'settings',
  'tags',
  'toastMessenger',
]);
